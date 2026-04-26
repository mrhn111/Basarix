'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'

type MufredatRow = {
  id: string
  subject: string
  unit: string
  topic: string
}

type TopicStats = {
  dogru: number
  yanlis: number
  bos: number
  bilgiEksikligi: number
  dikkatHatasi: number
}

export default function KonularPage() {
  const [mufredat, setMufredat] = useState<MufredatRow[]>([])
  const [statsMap, setStatsMap] = useState<Map<string, TopicStats>>(new Map())
  const [grade] = useState(() => {
    if (typeof window === 'undefined') return 7
    return parseInt(localStorage.getItem('basarix_grade') ?? '7') || 7
  })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()

    const [{ data: mufData }, examResult] = await Promise.all([
      supabase
        .from('mufredat')
        .select('id, subject, unit, topic')
        .eq('grade', grade)
        .order('subject')
        .order('unit')
        .order('topic'),
      session
        ? supabase
            .from('exams')
            .select(`
              exam_topics (
                mufredat_topic_id,
                exam_results (
                  dogru, yanlis, bos,
                  wrong_tags (tag, count)
                )
              )
            `)
            .eq('user_id', session.user.id)
            .eq('is_completed', true)
        : Promise.resolve({ data: null }),
    ])

    setMufredat(mufData ?? [])

    const map = new Map<string, TopicStats>()
    if (examResult.data) {
      for (const exam of examResult.data) {
        for (const et of exam.exam_topics) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const results: any[] = Array.isArray(et.exam_results)
            ? et.exam_results
            : et.exam_results ? [et.exam_results] : []
          for (const result of results) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tags: any[] = Array.isArray(result.wrong_tags) ? result.wrong_tags : []
            const bilgi = tags.filter(t => t.tag === 'bilgi_eksikligi').reduce((s, t) => s + t.count, 0)
            const dikkat = tags.filter(t => t.tag === 'dikkat_hatasi').reduce((s, t) => s + t.count, 0)
            const existing = map.get(et.mufredat_topic_id) ?? { dogru: 0, yanlis: 0, bos: 0, bilgiEksikligi: 0, dikkatHatasi: 0 }
            existing.dogru += result.dogru
            existing.yanlis += result.yanlis
            existing.bos += result.bos
            existing.bilgiEksikligi += bilgi
            existing.dikkatHatasi += dikkat
            map.set(et.mufredat_topic_id, existing)
          }
        }
      }
    }
    setStatsMap(map)
    setLoading(false)
  }, [grade])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
  }, [loadData])

  const subjectGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? mufredat.filter(t =>
          t.topic.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q) ||
          t.unit.toLowerCase().includes(q)
        )
      : mufredat

    const groups = new Map<string, MufredatRow[]>()
    for (const t of filtered) {
      const list = groups.get(t.subject) ?? []
      list.push(t)
      groups.set(t.subject, list)
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, 'tr'))
  }, [mufredat, search])

  const testedCount = mufredat.filter(t => statsMap.has(t.id)).length

  return (
    <div className="relative min-h-screen pb-28">
      <header className="sticky top-0 z-20 px-5 py-4 bg-white/55 dark:bg-zinc-950/70 backdrop-blur-md border-b border-white/40 dark:border-zinc-800/50 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
            Konular
          </span>
          {!loading && (
            <span className="text-xs text-zinc-400 font-medium">
              {grade}. Sınıf · {testedCount}/{mufredat.length} konu sınandı
            </span>
          )}
        </div>
        <input
          type="text"
          placeholder="Konu ara…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-4 py-2.5 rounded-2xl bg-zinc-100/70 dark:bg-zinc-800/70 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 outline-none"
        />
      </header>

      <div className="px-5 pt-4 pb-4 space-y-4">
        {loading ? (
          <p className="text-sm text-zinc-400 text-center py-16 animate-pulse">Yükleniyor…</p>
        ) : subjectGroups.length === 0 ? (
          <div className="bg-white/65 dark:bg-zinc-900/60 backdrop-blur-md rounded-3xl border border-white/50 dark:border-zinc-700/50 p-10 text-center">
            <p className="text-sm text-zinc-400">
              {mufredat.length === 0 ? 'Müfredat henüz yüklenmedi.' : 'Sonuç bulunamadı.'}
            </p>
          </div>
        ) : (
          subjectGroups.map(([subject, topics]) => (
            <div key={subject} className="bg-white/65 dark:bg-zinc-900/60 backdrop-blur-md rounded-3xl border border-white/50 dark:border-zinc-700/50 overflow-hidden">
              <div className="px-5 py-3 border-b border-zinc-100/70 dark:border-zinc-800/50 flex items-center justify-between">
                <h2 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">{subject}</h2>
                <span className="text-xs text-zinc-400">
                  {topics.filter(t => statsMap.has(t.id)).length}/{topics.length}
                </span>
              </div>
              <div className="divide-y divide-zinc-100/70 dark:divide-zinc-800/50">
                {topics.map(t => {
                  const stats = statsMap.get(t.id)
                  return (
                    <div key={t.id} className="px-5 py-3.5">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">{t.topic}</p>
                      <p className="text-xs text-zinc-400 mt-0.5 mb-1.5">{t.unit}</p>
                      {stats ? (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">D:{stats.dogru}</span>
                          <span className="text-rose-500 dark:text-rose-400 font-semibold">Y:{stats.yanlis}</span>
                          <span className="text-zinc-400 font-semibold">B:{stats.bos}</span>
                          {(stats.bilgiEksikligi > 0 || stats.dikkatHatasi > 0) && (
                            <span className="text-zinc-300 dark:text-zinc-700">·</span>
                          )}
                          {stats.bilgiEksikligi > 0 && (
                            <span className="text-rose-400 dark:text-rose-500">Bilgi Eksikliği: {stats.bilgiEksikligi}</span>
                          )}
                          {stats.dikkatHatasi > 0 && (
                            <span className="text-amber-500 dark:text-amber-400">Dikkat Hatası: {stats.dikkatHatasi}</span>
                          )}
                        </div>
                      ) : (
                        <p className="text-[11px] text-zinc-300 dark:text-zinc-600 italic">henüz sınav yok</p>
                      )}
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
