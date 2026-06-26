import { NextRequest, NextResponse } from 'next/server'
import { getServerClient, getAdminClient } from '@/lib/supabase-server'

type AiResult = {
  topics: unknown[]
  summary: string | null
}

const SYSTEM_INSTRUCTION = `Sen bir Türk öğrenci koçusun. Sana bir öğrencinin sınav geçmişi verilecek (ve varsa test sonuçları). Bu veriyi analiz et ve şunları belirle:
1. Hangi konular sürekli yanlış yapılıyor ve kötüleşiyor?
2. Hangi yanlışlar bilgi eksikliğinden, hangisi dikkatsizlikten?
3. Sınav türüne göre performans farkı var mı?
4. Öğrencinin en acil çalışması gereken 3 konu hangisi ve neden?

Yanıtını şu JSON formatında ver:
{
  "topics": [
    {
      "name": "konu adı",
      "subject": "ders adı",
      "reason": "neden bu konuya odaklanmalı (2-3 cümle)",
      "trend": "kötüleşiyor | stabil | iyileşiyor",
      "type": "bilgi_eksikligi | dikkat_hatasi | karma"
    }
  ],
  "summary": "genel durum hakkında 2-3 cümle"
}

Sadece JSON döndür, başka hiçbir şey yazma.`

const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'] as const

async function callGemini(apiKey: string, model: string, body: object): Promise<Response> {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serverClient = getServerClient(token)
  const { data: { user }, error: authError } = await serverClient.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getAdminClient()
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  const { data: cacheRow } = await admin
    .from('ai_cache')
    .select('last_called_at, result')
    .eq('user_id', user.id)
    .single() as { data: { last_called_at: string; result: AiResult | null } | null }

  if (cacheRow) {
    const lastCalled = new Date(cacheRow.last_called_at)
    if (lastCalled >= todayStart) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }
  }

  let grade: number
  let today: string
  try {
    const body = JSON.parse(await request.text()) as { grade?: unknown; today?: unknown }
    grade = Number(body.grade)
    today = typeof body.today === 'string' ? body.today.slice(0, 10) : new Date().toISOString().slice(0, 10)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!Number.isInteger(grade) || grade < 7 || grade > 12) {
    return NextResponse.json({ error: 'Invalid grade' }, { status: 400 })
  }

  // Fetch exam history server-side — never trust client-supplied data for the prompt
  const { data: exams } = await admin
    .from('exams')
    .select(`
      id, type, date,
      exam_topics (
        mufredat ( subject, topic ),
        exam_results (
          dogru, yanlis, bos,
          wrong_tags ( tag, count )
        )
      )
    `)
    .eq('user_id', user.id)
    .eq('is_completed', true)
    .order('date', { ascending: true })

  if (!exams || exams.length === 0) {
    return NextResponse.json({ topics: [], summary: null })
  }

  const { data: tests } = await admin
    .from('tests')
    .select(`id, subject, date, dogru, yanlis, bos, tag, test_topics ( mufredat ( topic ) )`)
    .eq('user_id', user.id)
    .order('date', { ascending: true })

  // Build exam history text
  type ExamTopic = {
    mufredat: { subject: string; topic: string } | null
    exam_results: { dogru: number; yanlis: number; bos: number; wrong_tags: { tag: string; count: number }[] } | { dogru: number; yanlis: number; bos: number; wrong_tags: { tag: string; count: number }[] }[]
  }

  const historyLines: string[] = []
  for (const exam of exams as unknown as { type: string; date: string; exam_topics: ExamTopic[] }[]) {
    const lines = (exam.exam_topics ?? []).flatMap((et: ExamTopic) => {
      const muf = et.mufredat
      if (!muf) return []
      const results = Array.isArray(et.exam_results) ? et.exam_results : et.exam_results ? [et.exam_results] : []
      return results.map(r => {
        const tags = Array.isArray(r.wrong_tags) ? r.wrong_tags : []
        const bilgi = tags.filter((t: { tag: string }) => t.tag === 'bilgi_eksikligi').reduce((s, t) => s + t.count, 0)
        const dikkat = tags.filter((t: { tag: string }) => t.tag === 'dikkat_hatasi').reduce((s, t) => s + t.count, 0)
        let line = `  - ${muf.subject}: ${muf.topic} | D:${r.dogru} Y:${r.yanlis} B:${r.bos}`
        if (bilgi > 0 || dikkat > 0) line += ` (Bilgi Eksikliği:${bilgi} Dikkat Hatası:${dikkat})`
        return line
      })
    })
    if (lines.length) historyLines.push(`${exam.type.toUpperCase()} | ${exam.date}\n${lines.join('\n')}`)
  }

  // Build test results text
  const testLines = (tests ?? []).map(t => {
    const ta = t as unknown as { subject: string; date: string; dogru: number; yanlis: number; bos: number; tag: string | null; test_topics: { mufredat: { topic: string } | null }[] }
    const topics = (ta.test_topics ?? []).map(tt => tt.mufredat?.topic ?? '').filter(Boolean).join(', ')
    const total = ta.dogru + ta.yanlis + ta.bos
    const pct = total > 0 ? Math.round((ta.dogru / total) * 100) : 0
    const tagLabel = ta.tag === 'bilgi_eksikligi' ? 'Bilgi Eksikliği' : ta.tag === 'dikkat_hatasi' ? 'Dikkat Hatası' : null
    return `  - ${ta.subject}: ${topics || '—'} | ${ta.dogru}/${total} (%${pct})${tagLabel ? ` [${tagLabel}]` : ''}`
  })

  const testText = testLines.length > 0 ? '\n\nTest Sonuçları:\n' + testLines.join('\n') : ''
  const userMessage = `Öğrenci: ${grade}. Sınıf\nBugün: ${today}\n\nSınav Geçmişi:\n${historyLines.join('\n\n') || '(yok)'}${testText}`

  const geminiBody = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
  }

  let geminiRes: Response | null = null
  for (const model of MODELS) {
    geminiRes = await callGemini(apiKey, model, geminiBody)
    if (geminiRes.status !== 429) break
  }

  if (!geminiRes || !geminiRes.ok) {
    if (cacheRow?.result) {
      return NextResponse.json({ ...cacheRow.result, stale: true })
    }
    return NextResponse.json({ error: 'Gemini API error' }, { status: 502 })
  }

  const data = await geminiRes.json()
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  try {
    const jsonText = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(jsonText)
    const result: AiResult = {
      topics: (parsed.topics ?? []).slice(0, 3),
      summary: parsed.summary ?? null,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('ai_cache').upsert({
      user_id: user.id,
      last_called_at: new Date().toISOString(),
      result,
    })

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Parse error' }, { status: 502 })
  }
}
