'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, CheckSquare, Square } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { clearAiCache } from '@/lib/ai-cache'
import type { Database } from '@/lib/database.types'

type ExamType = Database['public']['Enums']['exam_type']
type Step = 'type' | 'topics' | 'date' | 'results'
type TopicsView = 'subjects' | 'units' | 'topics'

interface MufredatRow {
  id: string
  grade: number
  subject: string
  unit: string
  topic: string
}

interface TopicResult {
  dogru: number
  yanlis: number
  bos: number
  bilgiEksikligi: number
}

const EXAM_LABELS: Record<ExamType, string> = {
  yazili: 'Yazılı',
  deneme: 'Deneme',
  lgs: 'LGS',
  tyt: 'TYT',
  ayt: 'AYT',
}

const EXAM_DESC: Record<ExamType, string> = {
  yazili: 'Okul sınavı',
  deneme: 'Deneme sınavı',
  lgs: 'Liselere Geçiş Sınavı',
  tyt: 'Temel Yeterlilik Testi',
  ayt: 'Alan Yeterlilik Testi',
}

const STEP_TITLE: Record<Step, string> = {
  type: 'Sınav Türü',
  topics: 'Konu Seçimi',
  date: 'Sınav Tarihi',
  results: 'Sonuç Girişi',
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

export default function NewExamPage() {
  const router = useRouter()

  const [grade] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem('basarix_grade')
    return stored ? parseInt(stored) : null
  })
  const [step, setStep] = useState<Step>('type')
  const [selectedType, setSelectedType] = useState<ExamType | null>(null)
  const [mufredat, setMufredat] = useState<MufredatRow[] | null>(null)
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [topicResults, setTopicResults] = useState<Record<string, TopicResult>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [topicsView, setTopicsView] = useState<TopicsView>('subjects')
  const [drillSubject, setDrillSubject] = useState<string | null>(null)
  const [drillUnit, setDrillUnit] = useState<string | null>(null)

  const loadingTopics = step === 'topics' && grade !== null && mufredat === null

  useEffect(() => {
    if (step !== 'topics' || !grade || mufredat !== null) return
    supabase
      .from('mufredat')
      .select('*')
      .eq('grade', grade)
      .order('subject')
      .order('unit')
      .order('topic')
      .then(({ data }) => {
        setMufredat(data ?? [])
      })
  }, [step, grade, mufredat])

  const availableTypes = useMemo<ExamType[]>(() => {
    const types: ExamType[] = ['yazili', 'deneme']
    if (grade === 8) types.push('lgs')
    if (grade === 12) types.push('tyt', 'ayt')
    return types
  }, [grade])

  const bySubjectUnit = useMemo(() =>
    (mufredat ?? []).reduce<Record<string, Record<string, MufredatRow[]>>>((acc, t) => {
      ;(acc[t.subject] ??= {})
      ;(acc[t.subject][t.unit] ??= []).push(t)
      return acc
    }, {}),
    [mufredat]
  )

  function enterTopicsStep() {
    setTopicsView('subjects')
    setDrillSubject(null)
    setDrillUnit(null)
    setStep('topics')
  }

  const stepNumber = step === 'type' ? 1 : step === 'topics' ? 2 : step === 'date' ? 3 : 4
  const isPast = selectedDate <= todayISO()

  function goBack() {
    setError(null)
    if (step === 'type') router.push('/')
    else if (step === 'topics') {
      if (topicsView === 'topics') { setTopicsView('units'); setDrillUnit(null) }
      else if (topicsView === 'units') { setTopicsView('subjects'); setDrillSubject(null) }
      else { setTopicsView('subjects'); setDrillSubject(null); setDrillUnit(null); setStep('type') }
    }
    else if (step === 'date') setStep('topics')
    else setStep('date')
  }

  function toggleTopic(id: string) {
    setSelectedTopicIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function toggleUnit(subject: string, unit: string) {
    const ids = (bySubjectUnit[subject]?.[unit] ?? []).map(t => t.id)
    const allSelected = ids.every(id => selectedTopicIds.includes(id))
    setSelectedTopicIds(prev =>
      allSelected ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]
    )
  }

  function updateResult(topicId: string, field: keyof TopicResult, raw: string) {
    const value = Math.max(0, parseInt(raw) || 0)
    setTopicResults(prev => {
      const cur = prev[topicId] ?? { dogru: 0, yanlis: 0, bos: 0, bilgiEksikligi: 0 }
      const next = { ...cur, [field]: value }
      if (field === 'yanlis') next.bilgiEksikligi = Math.min(cur.bilgiEksikligi, value)
      return { ...prev, [topicId]: next }
    })
  }

  function advanceFromTopics() {
    if (selectedTopicIds.length === 0) return
    setStep('date')
  }

  async function advanceFromDate() {
    if (!selectedDate) return
    if (!isPast) {
      await saveExam(false)
    } else {
      const initial: Record<string, TopicResult> = {}
      selectedTopicIds.forEach(id => { initial[id] = { dogru: 0, yanlis: 0, bos: 0, bilgiEksikligi: 0 } })
      setTopicResults(initial)
      setStep('results')
    }
  }

  function canSubmit(): boolean {
    return selectedTopicIds.every(id => {
      const r = topicResults[id]
      return r ? r.bilgiEksikligi <= r.yanlis : true
    })
  }

  async function saveExam(isCompleted: boolean) {
    setSaving(true)
    setError(null)
    try {
      let { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (error) throw error
        user = data.user
      }
      if (!user) throw new Error('Oturum açılamadı.')

      const payload = {
        type: selectedType!,
        date: selectedDate,
        is_completed: isCompleted,
        topics: selectedTopicIds.map(tid => {
          if (!isCompleted) return { mufredat_topic_id: tid, result: null }
          const r = topicResults[tid] ?? { dogru: 0, yanlis: 0, bos: 0, bilgiEksikligi: 0 }
          const dikkat = r.yanlis - r.bilgiEksikligi
          const wrongTags: { tag: string; count: number }[] = []
          if (r.bilgiEksikligi > 0) wrongTags.push({ tag: 'bilgi_eksikligi', count: r.bilgiEksikligi })
          if (dikkat > 0) wrongTags.push({ tag: 'dikkat_hatasi', count: dikkat })
          return {
            mufredat_topic_id: tid,
            result: { dogru: r.dogru, yanlis: r.yanlis, bos: r.bos, wrong_tags: wrongTags },
          }
        }),
      }

      const { error: rpcError } = await supabase.rpc('save_exam', { payload })
      if (rpcError) throw rpcError

      clearAiCache()
      router.push('/')
    } catch (e) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'Bir hata oluştu.'
      setError(msg)
      setSaving(false)
    }
  }

  // ── CTA button shared styles ────────────────────────────────
  const ctaActive = 'bg-[#0f766e]/75 hover:bg-[#0f766e]/85 backdrop-blur-md border border-white/30 text-white shadow-[0_8px_24px_rgba(15,118,110,0.25)] active:scale-[0.98]'
  const ctaDisabled = 'bg-zinc-100/60 backdrop-blur-md border border-white/40 text-zinc-400 cursor-not-allowed'

  return (
    <div className="relative min-h-screen pb-32">

      {/* ── Header ──────────────────────────────────────── */}
      <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-4 bg-white/55 backdrop-blur-md border-b border-white/40">
        <button
          onClick={goBack}
          className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-600 hover:bg-zinc-100/60 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-widest">Yeni Sınav</p>
          <h1 className="text-base font-extrabold text-zinc-900 leading-tight truncate">
            {step === 'topics' && topicsView === 'units' && drillSubject
              ? drillSubject
              : step === 'topics' && topicsView === 'topics' && drillUnit
              ? drillUnit
              : STEP_TITLE[step]}
          </h1>
        </div>
        <span className="text-sm font-bold text-zinc-400">{stepNumber}/4</span>
      </header>

      <div className="px-5 pt-6 pb-4 space-y-3">

        {/* ── Step 1: Type ──────────────────────────────── */}
        {step === 'type' && availableTypes.map(type => (
          <button
            key={type}
            onClick={() => setSelectedType(type)}
            className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl border transition-all duration-150 ${
              selectedType === type
                ? 'bg-[#0f766e] border-[#0f766e] text-white shadow-[0_4px_20px_rgba(15,118,110,0.3)] scale-[1.01]'
                : 'bg-white/65 backdrop-blur-md border-white/50 text-zinc-900'
            }`}
          >
            <span className="text-base font-extrabold">{EXAM_LABELS[type]}</span>
            <span className={`text-sm ${selectedType === type ? 'text-white/75' : 'text-zinc-400'}`}>
              {EXAM_DESC[type]}
            </span>
          </button>
        ))}

        {/* ── Step 2: Topics ────────────────────────────── */}
        {step === 'topics' && (
          <>
            {loadingTopics && (
              <p className="text-sm text-zinc-400 text-center py-12">Konular yükleniyor…</p>
            )}
            {!loadingTopics && (mufredat ?? []).length === 0 && (
              <div className="bg-white/65 backdrop-blur-md rounded-3xl border border-white/50 p-8 text-center">
                <p className="text-sm font-medium text-zinc-400">Müfredat henüz yüklenmedi.</p>
              </div>
            )}

            {/* Level 1: Subjects */}
            {!loadingTopics && topicsView === 'subjects' && Object.entries(bySubjectUnit).map(([subject, units]) => {
              const allTopicsInSubject = Object.values(units).flat()
              const selectedCount = allTopicsInSubject.filter(t => selectedTopicIds.includes(t.id)).length
              return (
                <button
                  key={subject}
                  onClick={() => { setDrillSubject(subject); setTopicsView('units') }}
                  className="w-full flex items-center justify-between px-5 py-4 rounded-2xl bg-white/65 backdrop-blur-md border border-white/50 text-left transition-all active:scale-[0.98]"
                >
                  <span className="text-sm font-extrabold text-zinc-900">{subject}</span>
                  <div className="flex items-center gap-2">
                    {selectedCount > 0 && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#0f766e]/15 text-[#0f766e]">
                        {selectedCount} seçili
                      </span>
                    )}
                    <ChevronLeft size={16} className="text-zinc-400 rotate-180" />
                  </div>
                </button>
              )
            })}

            {/* Level 2: Units */}
            {!loadingTopics && topicsView === 'units' && drillSubject && Object.entries(bySubjectUnit[drillSubject] ?? {}).map(([unit, topics]) => {
              const selectedCount = topics.filter(t => selectedTopicIds.includes(t.id)).length
              return (
                <button
                  key={unit}
                  onClick={() => { setDrillUnit(unit); setTopicsView('topics') }}
                  className="w-full flex items-center justify-between px-5 py-4 rounded-2xl bg-white/65 backdrop-blur-md border border-white/50 text-left transition-all active:scale-[0.98]"
                >
                  <div className="flex-1 min-w-0 pr-3">
                    <p className="text-sm font-extrabold text-zinc-900 leading-snug">{unit}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">{topics.length} konu</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {selectedCount > 0 && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#0f766e]/15 text-[#0f766e]">
                        {selectedCount}/{topics.length}
                      </span>
                    )}
                    <ChevronLeft size={16} className="text-zinc-400 rotate-180" />
                  </div>
                </button>
              )
            })}

            {/* Level 3: Topics checkboxes */}
            {!loadingTopics && topicsView === 'topics' && drillSubject && drillUnit && (() => {
              const topics = bySubjectUnit[drillSubject]?.[drillUnit] ?? []
              const selectedInUnit = topics.filter(t => selectedTopicIds.includes(t.id)).length
              const allSelected = selectedInUnit === topics.length
              return (
                <div className="bg-white/65 backdrop-blur-md rounded-3xl border border-white/50 overflow-hidden">
                  <button
                    onClick={() => toggleUnit(drillSubject, drillUnit)}
                    className="w-full flex items-center justify-between px-5 py-3.5 border-b border-white/40"
                  >
                    <span className="text-xs font-bold text-zinc-500">Tümünü seç / kaldır</span>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      allSelected
                        ? 'bg-[#0f766e] text-white'
                        : selectedInUnit > 0
                        ? 'bg-[#0f766e]/15 text-[#0f766e]'
                        : 'bg-zinc-100/60 text-zinc-400'
                    }`}>
                      {selectedInUnit}/{topics.length}
                    </span>
                  </button>
                  <ul className="divide-y divide-white/30">
                    {topics.map(t => {
                      const checked = selectedTopicIds.includes(t.id)
                      return (
                        <li key={t.id}>
                          <button
                            onClick={() => toggleTopic(t.id)}
                            className="w-full flex items-center gap-3 px-5 py-3.5 text-left"
                          >
                            <span className={`shrink-0 ${checked ? 'text-[#0f766e]' : 'text-zinc-300'}`}>
                              {checked ? <CheckSquare size={18} /> : <Square size={18} />}
                            </span>
                            <p className="text-sm font-semibold text-zinc-900 leading-snug">{t.topic}</p>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })()}
          </>
        )}

        {/* ── Step 3: Date ──────────────────────────────── */}
        {step === 'date' && (
          <>
            <div className="bg-white/65 backdrop-blur-md rounded-3xl border border-white/50 p-5">
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3">
                Sınav Tarihi
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full text-2xl font-black text-zinc-900 bg-transparent outline-none"
              />
            </div>
            {selectedDate && (
              <div className={`rounded-2xl px-4 py-3 text-sm font-medium ${
                isPast
                  ? 'bg-teal-50/65 backdrop-blur-md border border-teal-200/60 text-teal-800'
                  : 'bg-amber-50/65 backdrop-blur-md border border-amber-200/60 text-amber-800'
              }`}>
                {isPast
                  ? 'Geçmiş tarih — sonuçları bir sonraki adımda gireceksin.'
                  : 'Gelecek tarih — sınav yaklaşan olarak kaydedilecek.'}
              </div>
            )}
          </>
        )}

        {/* ── Step 4: Results ───────────────────────────── */}
        {step === 'results' && selectedTopicIds.map(id => {
          const topic = (mufredat ?? []).find(t => t.id === id)
          if (!topic) return null
          const r = topicResults[id] ?? { dogru: 0, yanlis: 0, bos: 0, bilgiEksikligi: 0 }
          const dikkat = Math.max(0, r.yanlis - r.bilgiEksikligi)
          return (
            <div key={id} className="bg-white/65 backdrop-blur-md rounded-3xl border border-white/50 p-5 space-y-4">
              <div>
                <p className="text-base font-extrabold text-zinc-900">{topic.topic}</p>
                <p className="text-xs text-zinc-400 mt-0.5">{topic.subject} · {topic.unit}</p>
              </div>

              {/* Doğru / Yanlış / Boş */}
              <div className="grid grid-cols-3 gap-2">
                {([
                  { field: 'dogru' as const, label: 'Doğru', color: 'text-emerald-500' },
                  { field: 'yanlis' as const, label: 'Yanlış', color: 'text-rose-500' },
                  { field: 'bos' as const, label: 'Boş', color: 'text-zinc-400' },
                ]).map(({ field, label, color }) => (
                  <div key={field} className="bg-zinc-50/60 backdrop-blur-sm rounded-2xl px-3 py-3 flex flex-col items-center gap-1">
                    <span className={`text-[11px] font-bold uppercase tracking-wide ${color}`}>{label}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={r[field] || ''}
                      placeholder="0"
                      onChange={e => updateResult(id, field, e.target.value)}
                      className="w-full text-center text-2xl font-black text-zinc-900 bg-transparent outline-none tabular-nums"
                    />
                  </div>
                ))}
              </div>

              {/* Wrong tag split — only when yanlış > 0 */}
              {r.yanlis > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Yanlışları etiketle</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-rose-50/60 backdrop-blur-sm rounded-2xl px-4 py-3">
                      <p className="text-[11px] font-bold text-rose-400 uppercase tracking-wide mb-1.5">Bilgi Eksikliği</p>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max={r.yanlis}
                        value={r.bilgiEksikligi || ''}
                        placeholder="0"
                        onChange={e => updateResult(id, 'bilgiEksikligi', e.target.value)}
                        className="w-full text-2xl font-black text-zinc-900 bg-transparent outline-none tabular-nums"
                      />
                    </div>
                    <div className="bg-zinc-50/60 backdrop-blur-sm rounded-2xl px-4 py-3">
                      <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide mb-1.5">Dikkat Hatası</p>
                      <p className="text-2xl font-black text-zinc-900 tabular-nums">{dikkat}</p>
                    </div>
                  </div>
                  {r.bilgiEksikligi > r.yanlis && (
                    <p className="text-xs text-rose-500 font-medium">Bilgi eksikliği sayısı yanlış sayısını geçemez.</p>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Error message */}
        {error && (
          <div className="rounded-2xl bg-rose-50/65 backdrop-blur-md border border-rose-200/60 px-4 py-3 text-sm text-rose-700 font-medium">
            {error}
          </div>
        )}

      </div>

      {/* ── Sticky CTA ──────────────────────────────────── */}
      <div className="fixed bottom-0 inset-x-0 px-5 pb-8 pt-6 bg-gradient-to-t from-white/70 via-white/40 to-transparent">
        {step === 'type' && (
          <button
            onClick={() => selectedType && enterTopicsStep()}
            disabled={!selectedType}
            className={`w-full h-14 rounded-2xl text-base font-extrabold transition-all duration-150 ${selectedType ? ctaActive : ctaDisabled}`}
          >
            Devam Et
          </button>
        )}
        {step === 'topics' && (
          <div className="space-y-3">
            {selectedTopicIds.length > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-[#0f766e]/10 border border-[#0f766e]/20">
                <span className="text-sm font-semibold text-[#0f766e]">Seçili konu</span>
                <span className="text-sm font-extrabold text-[#0f766e]">{' '}{selectedTopicIds.length}</span>
              </div>
            )}
            <button
              onClick={advanceFromTopics}
              disabled={selectedTopicIds.length === 0}
              className={`w-full h-14 rounded-2xl text-base font-extrabold transition-all duration-150 ${selectedTopicIds.length > 0 ? ctaActive : ctaDisabled}`}
            >
              {selectedTopicIds.length > 0 ? `Devam Et` : 'En az 1 konu seç'}
            </button>
          </div>
        )}
        {step === 'date' && (
          <button
            onClick={advanceFromDate}
            disabled={!selectedDate || saving}
            className={`w-full h-14 rounded-2xl text-base font-extrabold transition-all duration-150 ${!saving && selectedDate ? ctaActive : ctaDisabled}`}
          >
            {saving ? 'Kaydediliyor…' : isPast ? 'Devam Et' : 'Kaydet'}
          </button>
        )}
        {step === 'results' && (
          <button
            onClick={() => saveExam(true)}
            disabled={saving || !canSubmit()}
            className={`w-full h-14 rounded-2xl text-base font-extrabold transition-all duration-150 ${!saving && canSubmit() ? ctaActive : ctaDisabled}`}
          >
            {saving ? 'Kaydediliyor…' : 'Sonuçları Kaydet'}
          </button>
        )}
      </div>

    </div>
  )
}
