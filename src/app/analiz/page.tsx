'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'

type ExamType = 'yazili' | 'deneme' | 'lgs' | 'tyt' | 'ayt'

type TopicStat = {
  mufredat_topic_id: string
  subject: string
  topic: string
  dogru: number
  yanlis: number
  bos: number
  bilgiEksikligi: number
  dikkatHatasi: number
  rate: number
}

const EXAM_LABELS: Record<ExamType, string> = {
  yazili: 'Yazılı',
  deneme: 'Deneme',
  lgs: 'LGS',
  tyt: 'TYT',
  ayt: 'AYT',
}

function rateColors(rate: number) {
  if (rate > 70) return {
    bar: 'bg-emerald-500',
    badge: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400',
  }
  if (rate >= 40) return {
    bar: 'bg-amber-400',
    badge: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400',
  }
  return {
    bar: 'bg-rose-500',
    badge: 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400',
  }
}

export default function AnalizPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rawExams, setRawExams] = useState<any[]>([])
  const [availableTypes, setAvailableTypes] = useState<ExamType[]>([])
  const [activeFilter, setActiveFilter] = useState<ExamType | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }

    const { data } = await supabase
      .from('exams')
      .select(`
        type,
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
      .eq('is_completed', true)

    if (data) {
      setRawExams(data)
      const types = [...new Set(data.map(e => e.type as ExamType))]
      setAvailableTypes(types)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
  }, [loadData])

  const subjectGroups = useMemo(() => {
    const topicMap = new Map<string, TopicStat>()

    for (const exam of rawExams) {
      if (activeFilter && exam.type !== activeFilter) continue
      for (const et of exam.exam_topics) {
        if (!et.mufredat) continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results: any[] = Array.isArray(et.exam_results)
          ? et.exam_results
          : et.exam_results ? [et.exam_results] : []

        for (const result of results) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tags: any[] = Array.isArray(result.wrong_tags) ? result.wrong_tags : []
          const bilgi = tags.filter(t => t.tag === 'bilgi_eksikligi').reduce((s, t) => s + t.count, 0)
          const dikkat = tags.filter(t => t.tag === 'dikkat_hatasi').reduce((s, t) => s + t.count, 0)

          const existing = topicMap.get(et.mufredat_topic_id) ?? {
            mufredat_topic_id: et.mufredat_topic_id,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            subject: (et.mufredat as any).subject,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            topic: (et.mufredat as any).topic,
            dogru: 0, yanlis: 0, bos: 0, bilgiEksikligi: 0, dikkatHatasi: 0, rate: 0,
          }
          existing.dogru += result.dogru
          existing.yanlis += result.yanlis
          existing.bos += result.bos
          existing.bilgiEksikligi += bilgi
          existing.dikkatHatasi += dikkat
          topicMap.set(et.mufredat_topic_id, existing)
        }
      }
    }

    for (const stat of topicMap.values()) {
      const total = stat.dogru + stat.yanlis + stat.bos
      stat.rate = total > 0 ? Math.round((stat.dogru / total) * 100) : 0
    }

    const groups = new Map<string, TopicStat[]>()
    for (const stat of topicMap.values()) {
      const list = groups.get(stat.subject) ?? []
      list.push(stat)
      groups.set(stat.subject, list)
    }
    for (const list of groups.values()) {
      list.sort((a, b) => a.rate - b.rate)
    }

    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, 'tr'))
  }, [rawExams, activeFilter])

  return (
    <div className="relative min-h-screen pb-28">
      <header className="sticky top-0 z-20 px-5 py-4 bg-white/55 dark:bg-zinc-950/70 backdrop-blur-md border-b border-white/40 dark:border-zinc-800/50">
        <span className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">Analiz</span>
      </header>

      <div className="px-5 pt-4 pb-4 space-y-4">
        {/* Filter chips */}
        {availableTypes.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setActiveFilter(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                !activeFilter
                  ? 'bg-[#0f766e] text-white'
                  : 'bg-white/65 dark:bg-zinc-900/60 text-zinc-600 dark:text-zinc-400 border border-white/50 dark:border-zinc-700/50'
              }`}
            >
              Tümü
            </button>
            {availableTypes.map(type => (
              <button
                key={type}
                onClick={() => setActiveFilter(type)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                  activeFilter === type
                    ? 'bg-[#0f766e] text-white'
                    : 'bg-white/65 dark:bg-zinc-900/60 text-zinc-600 dark:text-zinc-400 border border-white/50 dark:border-zinc-700/50'
                }`}
              >
                {EXAM_LABELS[type]}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-zinc-400 text-center py-16 animate-pulse">Yükleniyor…</p>
        ) : subjectGroups.length === 0 ? (
          <div className="bg-white/65 dark:bg-zinc-900/60 backdrop-blur-md rounded-3xl border border-white/50 dark:border-zinc-700/50 p-10 text-center">
            <p className="text-sm text-zinc-400">Henüz tamamlanmış sınav yok.</p>
          </div>
        ) : (
          subjectGroups.map(([subject, topics]) => (
            <div key={subject} className="bg-white/65 dark:bg-zinc-900/60 backdrop-blur-md rounded-3xl border border-white/50 dark:border-zinc-700/50 overflow-hidden">
              <div className="px-5 py-3 border-b border-zinc-100/70 dark:border-zinc-800/50">
                <h2 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">{subject}</h2>
              </div>
              <div className="divide-y divide-zinc-100/70 dark:divide-zinc-800/50">
                {topics.map(t => {
                  const { bar, badge } = rateColors(t.rate)
                  return (
                    <div key={t.mufredat_topic_id} className="px-5 py-4 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex-1 min-w-0 leading-snug">{t.topic}</p>
                        <span className={`shrink-0 text-xs font-black px-2 py-0.5 rounded-full ${badge}`}>%{t.rate}</span>
                      </div>
                      <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${t.rate}%` }} />
                      </div>
                      <div className="flex items-center gap-3 text-[11px] flex-wrap">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">D:{t.dogru}</span>
                        <span className="text-rose-500 dark:text-rose-400 font-semibold">Y:{t.yanlis}</span>
                        <span className="text-zinc-400 font-semibold">B:{t.bos}</span>
                        {(t.bilgiEksikligi > 0 || t.dikkatHatasi > 0) && (
                          <span className="text-zinc-300 dark:text-zinc-700">·</span>
                        )}
                        {t.bilgiEksikligi > 0 && (
                          <span className="text-rose-400 dark:text-rose-500">Bilgi: {t.bilgiEksikligi}</span>
                        )}
                        {t.dikkatHatasi > 0 && (
                          <span className="text-amber-500 dark:text-amber-400">Dikkat: {t.dikkatHatasi}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <BottomNav />
    </div>
  )
}
