'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, CheckSquare, Square } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { clearAiCache } from '@/lib/ai-cache'

type Step = 'subject' | 'topics' | 'results'

interface MufredatRow {
  id: string
  grade: number
  subject: string
  unit: string
  topic: string
}

const STEP_TITLE: Record<Step, string> = {
  subject: 'Ders Seçimi',
  topics: 'Konu Seçimi',
  results: 'Sonuç Girişi',
}

const STEP_NUM: Record<Step, number> = {
  subject: 1,
  topics: 2,
  results: 3,
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

export default function NewTestPage() {
  const router = useRouter()

  const [grade] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem('basarix_grade')
    return stored ? parseInt(stored) : null
  })

  const [step, setStep] = useState<Step>('subject')
  const [mufredat, setMufredat] = useState<MufredatRow[] | null>(null)
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([])
  const [dogru, setDogru] = useState('')
  const [yanlis, setYanlis] = useState('')
  const [bos, setBos] = useState('')
  const [tag, setTag] = useState<'bilgi_eksikligi' | 'dikkat_hatasi' | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadingMufredat = mufredat === null && grade !== null

  useEffect(() => {
    if (!grade || mufredat !== null) return
    supabase
      .from('mufredat')
      .select('*')
      .eq('grade', grade)
      .order('subject')
      .order('unit')
      .order('topic')
      .then(({ data }) => setMufredat(data ?? []))
  }, [grade, mufredat])

  const subjects = useMemo(() => {
    if (!mufredat) return []
    return [...new Set(mufredat.map(r => r.subject))]
  }, [mufredat])

  const topicsForSubject = useMemo(() => {
    if (!mufredat || !selectedSubject) return []
    return mufredat.filter(r => r.subject === selectedSubject)
  }, [mufredat, selectedSubject])

  const byUnit = useMemo(() => {
    const map: Record<string, MufredatRow[]> = {}
    for (const row of topicsForSubject) {
      ;(map[row.unit] ??= []).push(row)
    }
    return map
  }, [topicsForSubject])

  function goBack() {
    setError(null)
    if (step === 'subject') router.push('/')
    else if (step === 'topics') {
      setSelectedTopicIds([])
      setStep('subject')
    } else {
      setStep('topics')
    }
  }

  function toggleTopic(id: string) {
    setSelectedTopicIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function toggleUnit(unit: string) {
    const ids = (byUnit[unit] ?? []).map(t => t.id)
    const allSelected = ids.every(id => selectedTopicIds.includes(id))
    setSelectedTopicIds(prev =>
      allSelected ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]
    )
  }

  function advanceToResults() {
    if (!selectedSubject || selectedTopicIds.length === 0) return
    setStep('results')
  }

  const dogruNum = Math.max(0, parseInt(dogru) || 0)
  const yanlisNum = Math.max(0, parseInt(yanlis) || 0)
  const bosNum = Math.max(0, parseInt(bos) || 0)

  function canSave() {
    if (dogruNum + yanlisNum + bosNum === 0) return false
    if (yanlisNum > 0 && !tag) return false
    return true
  }

  async function save() {
    if (!canSave() || !selectedSubject) return
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

      const { data: test, error: testErr } = await supabase
        .from('tests')
        .insert({
          user_id: user.id,
          subject: selectedSubject,
          date: todayISO(),
          dogru: dogruNum,
          yanlis: yanlisNum,
          bos: bosNum,
          tag: yanlisNum > 0 ? tag : null,
        })
        .select('id')
        .single()

      if (testErr || !test) throw testErr ?? new Error('Test kaydedilemedi.')

      if (selectedTopicIds.length > 0) {
        const { error: topicsErr } = await supabase.from('test_topics').insert(
          selectedTopicIds.map(tid => ({ test_id: test.id, mufredat_topic_id: tid }))
        )
        if (topicsErr) throw topicsErr
      }

      clearAiCache()
      router.push('/')
    } catch (e) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'Bir hata oluştu.'
      setError(msg)
      setSaving(false)
    }
  }

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
          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-widest">Yeni Test</p>
          <h1 className="text-base font-extrabold text-zinc-900 leading-tight truncate">
            {step === 'topics' && selectedSubject ? selectedSubject : STEP_TITLE[step]}
          </h1>
        </div>
        <span className="text-sm font-bold text-zinc-400">{STEP_NUM[step]}/3</span>
      </header>

      <div className="px-5 pt-6 pb-4 space-y-3">

        {/* ── Step 1: Subject ───────────────────────────── */}
        {step === 'subject' && (
          <>
            {loadingMufredat && (
              <p className="text-sm text-zinc-400 text-center py-12">Dersler yükleniyor…</p>
            )}
            {!loadingMufredat && subjects.length === 0 && (
              <div className="bg-white/65 backdrop-blur-md rounded-3xl border border-white/50 p-8 text-center">
                <p className="text-sm font-medium text-zinc-400">Müfredat henüz yüklenmedi.</p>
              </div>
            )}
            {subjects.map(subject => (
              <button
                key={subject}
                onClick={() => setSelectedSubject(subject)}
                className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl border transition-all duration-150 ${
                  selectedSubject === subject
                    ? 'bg-[#0f766e] border-[#0f766e] text-white shadow-[0_4px_20px_rgba(15,118,110,0.3)] scale-[1.01]'
                    : 'bg-white/65 backdrop-blur-md border-white/50 text-zinc-900'
                }`}
              >
                <span className="text-base font-extrabold">{subject}</span>
                <span className={`text-sm ${selectedSubject === subject ? 'text-white/75' : 'text-zinc-400'}`}>
                  {(mufredat ?? []).filter(r => r.subject === subject).length} konu
                </span>
              </button>
            ))}
          </>
        )}

        {/* ── Step 2: Topics ────────────────────────────── */}
        {step === 'topics' && (
          <>
            {Object.entries(byUnit).map(([unit, topics]) => {
              const selectedCount = topics.filter(t => selectedTopicIds.includes(t.id)).length
              const allSelected = selectedCount === topics.length
              return (
                <div key={unit} className="bg-white/65 backdrop-blur-md rounded-3xl border border-white/50 overflow-hidden">
                  <button
                    onClick={() => toggleUnit(unit)}
                    className="w-full flex items-center justify-between px-5 py-3.5 border-b border-white/40"
                  >
                    <p className="text-sm font-extrabold text-zinc-900 text-left leading-snug">{unit}</p>
                    <span className={`shrink-0 ml-2 text-xs font-bold px-2.5 py-1 rounded-full ${
                      allSelected
                        ? 'bg-[#0f766e] text-white'
                        : selectedCount > 0
                        ? 'bg-[#0f766e]/15 text-[#0f766e]'
                        : 'bg-zinc-100/60 text-zinc-400'
                    }`}>
                      {selectedCount}/{topics.length}
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
            })}
          </>
        )}

        {/* ── Step 3: Results ───────────────────────────── */}
        {step === 'results' && (
          <div className="space-y-4">
            <div className="bg-white/65 backdrop-blur-md rounded-3xl border border-white/50 p-5 space-y-4">
              <div>
                <p className="text-base font-extrabold text-zinc-900">{selectedSubject}</p>
                <p className="text-xs text-zinc-400 mt-0.5">{selectedTopicIds.length} konu seçildi</p>
              </div>

              {/* Doğru / Yanlış / Boş */}
              <div>
                <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Sonuçlar</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { label: 'Doğru', color: 'text-emerald-500', value: dogru, set: setDogru },
                    { label: 'Yanlış', color: 'text-rose-500', value: yanlis, set: setYanlis },
                    { label: 'Boş', color: 'text-zinc-400', value: bos, set: setBos },
                  ] as const).map(({ label, color, value, set }) => (
                    <div key={label} className="bg-zinc-50/60 backdrop-blur-sm rounded-2xl px-3 py-3 flex flex-col items-center gap-1">
                      <span className={`text-[11px] font-bold uppercase tracking-wide ${color}`}>{label}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={value}
                        placeholder="0"
                        onChange={e => set(e.target.value)}
                        className="w-full text-center text-2xl font-black text-zinc-900 bg-transparent outline-none tabular-nums"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Tag selection — only when yanlış > 0 */}
              {yanlisNum > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Yanlışları etiketle</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setTag('bilgi_eksikligi')}
                      className={`rounded-2xl px-4 py-3.5 text-sm font-extrabold text-left transition-all duration-150 ${
                        tag === 'bilgi_eksikligi'
                          ? 'bg-rose-500 text-white shadow-[0_4px_16px_rgba(239,68,68,0.3)] scale-[1.01]'
                          : 'bg-rose-50/60 backdrop-blur-sm text-rose-700 border border-rose-200/40'
                      }`}
                    >
                      Bilgi Eksikliği
                    </button>
                    <button
                      onClick={() => setTag('dikkat_hatasi')}
                      className={`rounded-2xl px-4 py-3.5 text-sm font-extrabold text-left transition-all duration-150 ${
                        tag === 'dikkat_hatasi'
                          ? 'bg-zinc-700 text-white shadow-[0_4px_16px_rgba(63,63,70,0.25)] scale-[1.01]'
                          : 'bg-zinc-50/60 backdrop-blur-sm text-zinc-700 border border-zinc-200/40'
                      }`}
                    >
                      Dikkat Hatası
                    </button>
                  </div>
                  {yanlisNum > 0 && !tag && (
                    <p className="text-xs text-amber-600 font-medium">Yanlış varsa etiket seçmen gerekiyor.</p>
                  )}
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-2xl bg-rose-50/65 backdrop-blur-md border border-rose-200/60 px-4 py-3 text-sm text-rose-700 font-medium">
                {error}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Sticky CTA ──────────────────────────────────── */}
      <div className="fixed bottom-0 inset-x-0 px-5 pb-8 pt-6 bg-gradient-to-t from-white/70 via-white/40 to-transparent">
        {step === 'subject' && (
          <button
            onClick={() => selectedSubject && setStep('topics')}
            disabled={!selectedSubject}
            className={`w-full h-14 rounded-2xl text-base font-extrabold transition-all duration-150 ${selectedSubject ? ctaActive : ctaDisabled}`}
          >
            Devam Et
          </button>
        )}
        {step === 'topics' && (
          <div className="space-y-3">
            {selectedTopicIds.length > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-[#0f766e]/10 border border-[#0f766e]/20">
                <span className="text-sm font-semibold text-[#0f766e]">Seçili konu</span>
                <span className="text-sm font-extrabold text-[#0f766e]">{selectedTopicIds.length}</span>
              </div>
            )}
            <button
              onClick={advanceToResults}
              disabled={selectedTopicIds.length === 0}
              className={`w-full h-14 rounded-2xl text-base font-extrabold transition-all duration-150 ${selectedTopicIds.length > 0 ? ctaActive : ctaDisabled}`}
            >
              {selectedTopicIds.length > 0 ? 'Devam Et' : 'En az 1 konu seç'}
            </button>
          </div>
        )}
        {step === 'results' && (
          <button
            onClick={save}
            disabled={saving || !canSave()}
            className={`w-full h-14 rounded-2xl text-base font-extrabold transition-all duration-150 ${!saving && canSave() ? ctaActive : ctaDisabled}`}
          >
            {saving ? 'Kaydediliyor…' : 'Testi Kaydet'}
          </button>
        )}
      </div>

    </div>
  )
}
