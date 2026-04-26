'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Zap, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { AI_CACHE_KEY, clearAiCache, hasCalledAiToday, markAiCalled } from '@/lib/ai-cache'
import BottomNav from '@/components/BottomNav'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function getCountdown(grade: number): { name: string; days: number } | null {
  const today = new Date()
  const year = today.getFullYear()
  const targets: Partial<Record<number, { name: string; date: Date }>> = {
    8: { name: 'LGS', date: new Date(year, 5, 1) },
    12: { name: 'TYT', date: new Date(year, 5, 20) },
  }
  const target = targets[grade]
  if (!target) return null
  const days = Math.ceil((target.date.getTime() - today.getTime()) / 86400000)
  return days > 0 ? { name: target.name, days } : null
}

const EXAM_LABEL: Record<string, string> = {
  yazili: 'Yazılı',
  deneme: 'Deneme',
  lgs: 'LGS',
  tyt: 'TYT',
  ayt: 'AYT',
}

const EXAM_BADGE_COLOR: Record<string, string> = {
  yazili: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
  deneme: 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400',
  lgs: 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400',
  tyt: 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-400',
  ayt: 'bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400',
}

type RecentExam = {
  id: string
  type: string
  date: string
  is_completed: boolean
}

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

type AiTopic = {
  name: string
  subject: string
  reason: string
  trend: 'kötüleşiyor' | 'stabil' | 'iyileşiyor'
  type: 'bilgi_eksikligi' | 'dikkat_hatasi' | 'karma'
}

type AiResult = {
  topics: AiTopic[]
  summary: string | null
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function Home() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [grade] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem('basarix_grade')
    return stored ? parseInt(stored) : null
  })
  const [examCount, setExamCount] = useState(0)
  const [basariPercent, setBasariPercent] = useState<number | null>(null)
  const [weakCount, setWeakCount] = useState(0)
  const [recentExams, setRecentExams] = useState<RecentExam[]>([])
  const [aiResult, setAiResult] = useState<AiResult | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  const loadData = useCallback(async () => {
    let aiCached = false
    const cached = localStorage.getItem(AI_CACHE_KEY)
    if (cached) {
      try {
        const { date, result } = JSON.parse(cached)
        if (date === todayStr() && result && Array.isArray(result.topics)) {
          setAiResult(result)
          aiCached = true
        } else {
          clearAiCache()
        }
      } catch {
        clearAiCache()
      }
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    console.log('[loadData] querying exams for user:', session.user.id)

    const { data: exams } = await supabase
      .from('exams')
      .select(`
        id, type, date, is_completed,
        exam_topics (
          mufredat_topic_id,
          mufredat (subject, topic),
          exam_results (
            dogru, yanlis, bos,
            wrong_tags (tag, count)
          )
        )
      `)
      .eq('user_id', session.user.id)
      .order('date', { ascending: false })

    console.log('[loadData] exams returned:', exams?.length ?? 'null')
    if (!exams) return

    setRecentExams(
      exams.slice(0, 3).map(e => ({
        id: e.id,
        type: e.type,
        date: e.date,
        is_completed: e.is_completed,
      }))
    )

    const completed = exams.filter(e => e.is_completed)
    setExamCount(completed.length)

    let totalDogru = 0
    let totalSoru = 0
    const weakTopicMap = new Map<string, number>()
    const examHistory: ExamHistoryItem[] = []

    for (const exam of completed) {
      for (const topic of exam.exam_topics) {
        const results = Array.isArray(topic.exam_results)
          ? topic.exam_results
          : topic.exam_results
          ? [topic.exam_results]
          : []

        for (const result of results) {
          totalDogru += result.dogru
          totalSoru += result.dogru + result.yanlis + result.bos

          const tags = Array.isArray(result.wrong_tags) ? result.wrong_tags : []
          const bilgiCount = (tags as { tag: string; count: number }[])
            .filter(t => t.tag === 'bilgi_eksikligi')
            .reduce((s, t) => s + t.count, 0)
          const dikkatCount = (tags as { tag: string; count: number }[])
            .filter(t => t.tag === 'dikkat_hatasi')
            .reduce((s, t) => s + t.count, 0)

          if (topic.mufredat) {
            const muf = topic.mufredat as unknown as { subject: string; topic: string }
            examHistory.push({
              type: exam.type,
              date: exam.date,
              subject: muf.subject,
              topic: muf.topic,
              dogru: result.dogru,
              yanlis: result.yanlis,
              bos: result.bos,
              bilgiEksikligi: bilgiCount,
              dikkatsizlik: dikkatCount,
            })
            if (bilgiCount > 0) {
              weakTopicMap.set(
                topic.mufredat_topic_id,
                (weakTopicMap.get(topic.mufredat_topic_id) ?? 0) + bilgiCount
              )
            }
          }
        }
      }
    }

    setWeakCount(weakTopicMap.size)
    setBasariPercent(totalSoru > 0 ? Math.round((totalDogru / totalSoru) * 100) : null)

    if (!aiCached && examHistory.length > 0 && !hasCalledAiToday()) {
      const gradeVal = parseInt(localStorage.getItem('basarix_grade') ?? '7') || 7
      setAiLoading(true)
      try {
        const res = await fetch('/api/ai-recommendation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ grade: gradeVal, today: todayStr(), exams: examHistory }),
        })
        if (res.ok) {
          const result = await res.json() as AiResult & { error?: string }
          if (!result.error) {
            setAiResult(result)
            localStorage.setItem(AI_CACHE_KEY, JSON.stringify({ date: todayStr(), result }))
            markAiCalled()
          }
        } else if (res.status === 429) {
          markAiCalled()
        }
      } catch {
        // ignore
      } finally {
        setAiLoading(false)
      }
    }
  }, [])

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    async function init() {
      const pendingAnonId = localStorage.getItem('basarix_pending_merge_anon_id')
      if (pendingAnonId) {
        const { data: { session } } = await supabase.auth.getSession()
        const { data: { user } } = await supabase.auth.getUser()
        console.log('[merge] pending anon id:', pendingAnonId, '| new user:', user?.id, '| is_anonymous:', user?.is_anonymous)
        if (session && user && !user.is_anonymous) {
          localStorage.removeItem('basarix_pending_merge_anon_id')
          try {
            const res = await fetch('/api/merge-guest', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ anonUserId: pendingAnonId }),
            })
            const body = await res.json()
            console.log('[merge] result:', res.status, body)
          } catch (e) {
            console.error('[merge] fetch error:', e)
          }
        } else {
          console.log('[merge] skipped — no valid non-anonymous session yet')
        }
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadData()
    }
    init()
  }, [loadData])

  if (!mounted) return null

  const countdown = grade ? getCountdown(grade) : null

  return (
    <div className="relative min-h-screen pb-28">

      {/* ── Header ─────────────────────────────────────── */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-5 py-4 bg-white/55 dark:bg-zinc-950/70 backdrop-blur-md border-b border-white/40 dark:border-zinc-800/50">
        <span className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-100 select-none">
          başarı<span className="text-[#0f766e]">x</span>
        </span>
        <div className="w-9 h-9 rounded-full bg-[#0f766e] flex items-center justify-center text-white text-sm font-bold shadow-sm">
          {grade ? `${grade}` : '?'}
        </div>
      </header>

      <div className="px-5 space-y-4">

        {/* ── Greeting ───────────────────────────────────── */}
        <section className="pt-1 pb-8">
          <h1 className="text-5xl font-black tracking-tight text-zinc-900 dark:text-zinc-100 leading-none mb-3">
            Merhaba!
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {grade ? (
              <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">{grade}. Sınıf</span>
            ) : (
              <span className="text-sm text-zinc-400">Misafir olarak devam ediyorsun</span>
            )}
            {countdown && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#0f766e]/10 text-[#0f766e] text-xs font-bold">
                <Calendar size={12} />
                {countdown.name}&apos;ye {countdown.days} gün
              </span>
            )}
          </div>
          {!grade && (
            <p className="mt-3 text-xs text-zinc-400 underline underline-offset-2 cursor-pointer">
              Hesap oluştur ve verilerini kaydet →
            </p>
          )}
        </section>

        {/* ── AI Study Card ──────────────────────────────── */}
        <div className="-mt-2 bg-white/65 dark:bg-zinc-900/60 backdrop-blur-md rounded-3xl shadow-[0_8px_32px_rgba(15,23,42,0.06)] border border-white/50 dark:border-zinc-700/50 p-5">
          <p className="flex items-center gap-1.5 text-xs font-bold text-[#0f766e] uppercase tracking-widest mb-3">
            <Zap size={12} />
            Yapay zeka analizi
          </p>
          {aiLoading ? (
            <p className="text-sm text-zinc-400 animate-pulse">Analiz ediliyor...</p>
          ) : aiResult && aiResult.topics && aiResult.topics.length > 0 ? (
            <div className="space-y-3">
              {aiResult.summary && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{aiResult.summary}</p>
              )}
              <div className="space-y-2">
                {aiResult.topics.map((topic, i) => {
                  const TrendIcon =
                    topic.trend === 'kötüleşiyor' ? TrendingDown
                    : topic.trend === 'iyileşiyor' ? TrendingUp
                    : Minus
                  const trendColor =
                    topic.trend === 'kötüleşiyor' ? 'text-rose-500'
                    : topic.trend === 'iyileşiyor' ? 'text-emerald-500'
                    : 'text-zinc-400'
                  return (
                    <div key={i} className="bg-zinc-50/70 dark:bg-zinc-800/60 rounded-2xl p-4 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-snug">{topic.name}</p>
                          <p className="text-xs text-zinc-400 mt-0.5">{topic.subject}</p>
                        </div>
                        <TrendIcon size={16} className={`shrink-0 mt-0.5 ${trendColor}`} />
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{topic.reason}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-400 leading-relaxed">
              Sınav ekledikçe öneriler burada görünecek.
            </p>
          )}
        </div>

        {/* ── Stats Row ─────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Sınav', value: String(examCount) },
            { label: 'Başarı', value: basariPercent !== null ? `%${basariPercent}` : '—' },
            { label: 'Zayıf Konu', value: String(weakCount) },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="bg-white/65 dark:bg-zinc-900/60 backdrop-blur-md rounded-2xl shadow-[0_4px_20px_rgba(15,23,42,0.05)] border border-white/50 dark:border-zinc-700/50 px-2 py-4 flex flex-col items-center gap-1"
            >
              <span className="text-3xl font-black text-zinc-900 dark:text-zinc-100 leading-none tabular-nums">
                {value}
              </span>
              <span className="text-[11px] text-zinc-400 font-medium text-center leading-tight">
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* ── Recent Exams ───────────────────────────────── */}
        <div className="bg-white/65 dark:bg-zinc-900/60 backdrop-blur-md rounded-3xl shadow-[0_8px_32px_rgba(15,23,42,0.06)] border border-white/50 dark:border-zinc-700/50 overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <h2 className="text-base font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">Son Sınavlar</h2>
          </div>
          {recentExams.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-zinc-400">
              Henüz sınav eklemedin. Başlamak için aşağıdaki butona tıkla.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100/70 dark:divide-zinc-800/50">
              {recentExams.map(exam => (
                <li key={exam.id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${EXAM_BADGE_COLOR[exam.type] ?? 'bg-zinc-100 text-zinc-600'}`}>
                      {EXAM_LABEL[exam.type] ?? exam.type}
                    </span>
                    {!exam.is_completed && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                        Yaklaşan
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-400 font-medium">{formatDate(exam.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Add Exam Button ────────────────────────────── */}
        <button
          onClick={() => router.push('/exam/new')}
          className="w-full h-14 bg-[#0f766e]/75 hover:bg-[#0f766e]/85 backdrop-blur-md border border-white/30 active:scale-[0.98] text-white font-extrabold text-base rounded-2xl shadow-[0_8px_24px_rgba(15,118,110,0.25)] transition-all duration-150"
        >
          + Sınav Ekle
        </button>

      </div>

      <BottomNav />
    </div>
  )
}
