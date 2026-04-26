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

type ApiPayload = {
  grade: number
  today: string
  exams: ExamHistoryItem[]
}

const SYSTEM_INSTRUCTION = `Sen bir Türk öğrenci koçusun. Sana bir öğrencinin sınav geçmişi verilecek. Bu veriyi analiz et ve şunları belirle:
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

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  // Auth check
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

  // Size guard (50KB)
  const contentLength = request.headers.get('content-length')
  if (contentLength && parseInt(contentLength) > 50_000) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  // Rate limit: once per user per day via ai_cache table
  const admin = getAdminClient()
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  const { data: cacheRow } = await admin
    .from('ai_cache')
    .select('last_called_at')
    .eq('user_id', user.id)
    .single()

  if (cacheRow) {
    const lastCalled = new Date(cacheRow.last_called_at)
    if (lastCalled >= todayStart) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }
  }

  const { grade, today, exams }: ApiPayload = await request.json()

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

  const userMessage = `Öğrenci: ${grade}. Sınıf\nBugün: ${today}\n\nSınav Geçmişi:\n${historyText}`

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
    }
  )

  if (!geminiRes.ok) {
    return NextResponse.json({ error: 'Gemini API error' }, { status: 502 })
  }

  const data = await geminiRes.json()
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  try {
    const jsonText = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(jsonText)

    // Update ai_cache after successful Gemini call
    await admin.from('ai_cache').upsert({
      user_id: user.id,
      last_called_at: new Date().toISOString(),
    })

    return NextResponse.json({
      topics: (parsed.topics ?? []).slice(0, 3),
      summary: parsed.summary ?? null,
    })
  } catch {
    return NextResponse.json({ error: 'Parse error' }, { status: 502 })
  }
}
