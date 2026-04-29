'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, Download, LogOut, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'
import type { User as SupabaseUser } from '@supabase/supabase-js'

const GRADES = [7, 8, 9, 10, 11, 12]
const ALAN_OPTIONS = ['Sayısal', 'Sözel', 'EA', 'Dil']

export default function AyarlarPage() {
  const [mounted, setMounted] = useState(false)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [grade, setGradeState] = useState(() => {
    if (typeof window === 'undefined') return 7
    return parseInt(localStorage.getItem('basarix_grade') ?? '7') || 7
  })
  const [alan, setAlanState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('basarix_alan')
  })
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authSuccess, setAuthSuccess] = useState<string | null>(null)
  const [exportLoading, setExportLoading] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  function changeGrade(g: number) {
    setGradeState(g)
    localStorage.setItem('basarix_grade', String(g))
    if (g !== 12) {
      setAlanState(null)
      localStorage.removeItem('basarix_alan')
    }
  }

  function changeAlan(a: string) {
    setAlanState(a)
    localStorage.setItem('basarix_alan', a)
  }

  async function handleAuth() {
    setAuthLoading(true)
    setAuthError(null)
    setAuthSuccess(null)
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      const isAnon = currentUser?.is_anonymous ?? false
      const anonToken = currentSession?.access_token ?? null

      if (authMode === 'signup') {
        let mergeReady = false
        if (isAnon && anonToken) {
          const prepRes = await fetch('/api/prepare-merge', {
            method: 'POST',
            headers: { Authorization: `Bearer ${anonToken}` },
          })
          mergeReady = prepRes.ok
        }
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (data.session) {
          setUser(data.user)
          if (mergeReady) {
            fetch('/api/merge-guest', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${data.session.access_token}` },
            }).catch(() => undefined)
          }
        } else {
          if (mergeReady) localStorage.setItem('basarix_merge_pending', '1')
          setAuthSuccess('E-posta doğrulama linki gönderildi. Gelen kutunu kontrol et.')
        }
        setEmail('')
        setPassword('')
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        setUser(data.user)
        setEmail('')
        setPassword('')
        if (isAnon && anonToken && data.session?.access_token) {
          const newToken = data.session.access_token
          fetch('/api/prepare-merge', {
            method: 'POST',
            headers: { Authorization: `Bearer ${anonToken}` },
          }).then(r => r.ok ? r.json() : null).then(body => {
            if (!body?.ok) return
            fetch('/api/merge-guest', {
              method: 'POST',
              headers: { Authorization: `Bearer ${newToken}` },
            }).catch(() => undefined)
          }).catch(() => undefined)
        }
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : ''
      if (raw.includes('already registered') || raw.includes('already exists')) {
        setAuthError('Bu e-posta adresi zaten kayıtlı.')
      } else if (raw.includes('Invalid login credentials') || raw.includes('invalid_credentials')) {
        setAuthError('E-posta veya şifre hatalı.')
      } else if (raw.includes('Email not confirmed')) {
        setAuthError('E-posta adresin henüz doğrulanmadı. Gelen kutunu kontrol et.')
      } else if (raw.includes('Password should be')) {
        setAuthError('Şifre en az 6 karakter olmalıdır.')
      } else {
        setAuthError('Bir hata oluştu. Lütfen tekrar dene.')
      }
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    setUser(null)
    setAuthMode('login')
    setAuthError(null)
    setAuthSuccess(null)
  }

  async function exportCSV() {
    setExportLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data } = await supabase
        .from('exams')
        .select(`
          type, date,
          exam_topics (
            mufredat (subject, topic),
            exam_results (
              dogru, yanlis, bos,
              wrong_tags (tag, count)
            )
          )
        `)
        .eq('user_id', session.user.id)
        .eq('is_completed', true)
        .order('date')

      if (!data) return

      function csvCell(val: string): string {
        const safe = /^[=+\-@\t\r]/.test(val) ? `'${val}` : val
        return `"${safe.replace(/"/g, '""')}"`
      }

      const rows: string[] = ['Tarih,Sınav Türü,Ders,Konu,Doğru,Yanlış,Boş,Bilgi Eksikliği,Dikkat Hatası']
      for (const exam of data) {
        for (const et of exam.exam_topics) {
          if (!et.mufredat) continue
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const results: any[] = Array.isArray(et.exam_results)
            ? et.exam_results
            : et.exam_results ? [et.exam_results] : []
          for (const r of results) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tags: any[] = Array.isArray(r.wrong_tags) ? r.wrong_tags : []
            const bilgi = tags.filter(t => t.tag === 'bilgi_eksikligi').reduce((s, t) => s + t.count, 0)
            const dikkat = tags.filter(t => t.tag === 'dikkat_hatasi').reduce((s, t) => s + t.count, 0)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const muf = et.mufredat as any
            rows.push([exam.date, exam.type, csvCell(muf.subject), csvCell(muf.topic), r.dogru, r.yanlis, r.bos, bilgi, dikkat].join(','))
          }
        }
      }

      const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `basarix_sinav_gecmisi_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExportLoading(false)
    }
  }

  if (!mounted) return null

  const isGuest = !user?.email

  return (
    <div className="relative min-h-screen pb-28">
      <header className="sticky top-0 z-20 px-5 py-4 bg-white/55 backdrop-blur-md border-b border-white/40">
        <span className="text-xl font-black tracking-tight text-zinc-900">Ayarlar</span>
      </header>

      <div className="px-5 pt-5 pb-4 space-y-4">

        {/* ── Hesap ─────────────────────────────────────── */}
        <div className="bg-white/65 backdrop-blur-md rounded-3xl border border-white/50 overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-100/70">
            <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Hesap</h2>
          </div>

          {isGuest ? (
            <div className="p-5 space-y-3">
              <p className="text-sm font-semibold text-zinc-700">
                {authMode === 'signup' ? 'Hesap Oluştur' : 'Giriş Yap'}
              </p>
              {authMode === 'signup' && (
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Mevcut sınav verilerini koruyarak hesabına bağlayacak.
                </p>
              )}
              <input
                type="email"
                placeholder="E-posta"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-zinc-100/70 text-sm text-zinc-900 placeholder-zinc-400 outline-none"
              />
              <input
                type="password"
                placeholder="Şifre"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAuth()}
                className="w-full px-4 py-3 rounded-2xl bg-zinc-100/70 text-sm text-zinc-900 placeholder-zinc-400 outline-none"
              />
              {authError && <p className="text-xs text-rose-500">{authError}</p>}
              {authSuccess && <p className="text-xs text-emerald-500">{authSuccess}</p>}
              <button
                onClick={handleAuth}
                disabled={authLoading || !email || !password}
                className="w-full h-11 rounded-2xl text-sm font-bold text-white bg-[#0f766e] disabled:opacity-50 active:scale-[0.98] transition-transform"
              >
                {authLoading ? 'Lütfen bekle…' : authMode === 'signup' ? 'Kayıt Ol' : 'Giriş Yap'}
              </button>
              <p className="text-center text-xs text-zinc-400 pt-1">
                {authMode === 'login' ? (
                  <>Hesabın yok mu?{' '}
                    <button
                      onClick={() => { setAuthMode('signup'); setAuthError(null); setAuthSuccess(null) }}
                      className="text-[#0f766e] font-semibold"
                    >
                      Kayıt ol
                    </button>
                  </>
                ) : (
                  <>Zaten hesabın var mı?{' '}
                    <button
                      onClick={() => { setAuthMode('login'); setAuthError(null); setAuthSuccess(null) }}
                      className="text-[#0f766e] font-semibold"
                    >
                      Giriş yap
                    </button>
                  </>
                )}
              </p>
            </div>
          ) : (
            <div className="px-5 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 shrink-0 rounded-full bg-[#0f766e] flex items-center justify-center text-white">
                  <User size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 truncate">{user?.email}</p>
                  <p className="text-xs text-zinc-400">Kayıtlı hesap</p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-rose-500 px-3 py-2 rounded-xl bg-rose-50/70 active:scale-[0.97] transition-transform"
              >
                <LogOut size={14} />
                Çıkış Yap
              </button>
            </div>
          )}
        </div>

        {/* ── Profil ────────────────────────────────────── */}
        <div className="bg-white/65 backdrop-blur-md rounded-3xl border border-white/50 overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-100/70">
            <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Profil</h2>
          </div>
          <div className="divide-y divide-zinc-100/70">
            <div className="px-5 py-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-900">Sınıf</p>
              <div className="relative">
                <select
                  value={grade}
                  onChange={e => changeGrade(parseInt(e.target.value))}
                  className="appearance-none pl-3 pr-7 py-1.5 rounded-xl bg-zinc-100/70 text-sm font-bold text-zinc-900 outline-none cursor-pointer"
                >
                  {GRADES.map(g => <option key={g} value={g}>{g}. Sınıf</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>
            {grade === 12 && (
              <div className="px-5 py-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-zinc-900">Alan</p>
                <div className="relative">
                  <select
                    value={alan ?? ''}
                    onChange={e => changeAlan(e.target.value)}
                    className="appearance-none pl-3 pr-7 py-1.5 rounded-xl bg-zinc-100/70 text-sm font-bold text-zinc-900 outline-none cursor-pointer"
                  >
                    <option value="">Seç</option>
                    {ALAN_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Veri ──────────────────────────────────────── */}
        <div className="bg-white/65 backdrop-blur-md rounded-3xl border border-white/50 overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-100/70">
            <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Veri</h2>
          </div>
          <div className="px-5 py-4">
            <button
              onClick={exportCSV}
              disabled={exportLoading}
              className="flex items-center gap-2 text-sm font-semibold text-[#0f766e] disabled:opacity-50 active:scale-[0.97] transition-transform"
            >
              <Download size={16} />
              {exportLoading ? 'Hazırlanıyor…' : 'Sınav geçmişini CSV olarak dışa aktar'}
            </button>
          </div>
        </div>

      </div>

      <BottomNav />
    </div>
  )
}
