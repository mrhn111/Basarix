import { NextRequest, NextResponse } from 'next/server'
import { getServerClient, getAdminClient } from '@/lib/supabase-server'

type ExamHistoryItem = {
  type: string
  date: string
  subject: string
  topic: string
  dogru: number
  yanlis: number
  bos: number
  bilgiEksikligi: number
  dikkatsizlik: number
}

type TestResultItem = {
  date: string
  subject: string
  topic: string
  correct: number
  total: number
  tag: string | null
}

type ApiPayload = {
  grade: number
  today: string
  exams: ExamHistoryItem[]
  test_results?: TestResultItem[]
}

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

  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody, 'utf8') > 50_000) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }
  let payload: ApiPayload
  try {
    payload = JSON.parse(rawBody) as ApiPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { grade, today, exams, test_results = [] } = payload

  if (!exams || exams.length === 0) {
    return NextResponse.json({ topics: [], summary: null })
  }

  const sorted = [...exams].sort((a, b) => a.date.localeCompare(b.date))
  const grouped = new Map<string, ExamHistoryItem[]>()
  for (const item of sorted) {
    const key = `${item.date}|${item.type}`
    const group = grouped.get(key) ?? []
    group.push(item)
    grouped.set(key, group)
  }

  const historyText = Array.from(grouped.entries())
    .map(([key, items]) => {
      const [date, type] = key.split('|')
      const lines = items
        .map(item => {
          let line = `  - ${item.subject}: ${item.topic} | D:${item.dogru} Y:${item.yanlis} B:${item.bos}`
          if (item.bilgiEksikligi > 0 || item.dikkatsizlik > 0) {
            line += ` (Bilgi Eksikliği:${item.bilgiEksikligi} Dikkat Hatası:${item.dikkatsizlik})`
          }
          return line
        })
        .join('\n')
      return `${type.toUpperCase()} | ${date}\n${lines}`
    })
    .join('\n\n')

  const testText = test_results.length > 0
    ? '\n\nTest Sonuçları:\n' + test_results
        .map(t => {
          const pct = t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0
          const tagLabel = t.tag === 'bilgi_eksikligi' ? 'Bilgi Eksikliği'
            : t.tag === 'dikkat_hatasi' ? 'Dikkat Hatası'
            : null
          return `  - ${t.subject}: ${t.topic} | ${t.correct}/${t.total} (%${pct})${tagLabel ? ` [${tagLabel}]` : ''}`
        })
        .join('\n')
    : ''

  const userMessage = `Öğrenci: ${grade}. Sınıf\nBugün: ${today}\n\nSınav Geçmişi:\n${historyText}${testText}`

  const geminiBody = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
  }

  // Try flash-lite first, fall back to flash on 429
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
