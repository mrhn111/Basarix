'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Home, BarChart2, BookOpen, Settings } from 'lucide-react'

const NAV_ITEMS = [
  { icon: Home, label: 'Ana Sayfa', href: '/' },
  { icon: BarChart2, label: 'Analiz', href: '/analiz' },
  { icon: BookOpen, label: 'Konular', href: '/konular' },
  { icon: Settings, label: 'Ayarlar', href: '/ayarlar' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white/55 dark:bg-zinc-950/70 backdrop-blur-md border-t border-white/50 dark:border-zinc-800/50 flex z-20">
      {NAV_ITEMS.map(({ icon: Icon, label, href }) => {
        const active = pathname === href
        return (
          <button
            key={href}
            onClick={() => router.push(href)}
            className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 transition-colors ${
              active
                ? 'text-[#0f766e]'
                : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'
            }`}
          >
            <Icon size={22} strokeWidth={1.75} />
            <span className={`text-[11px] ${active ? 'font-bold' : 'font-semibold'}`}>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
