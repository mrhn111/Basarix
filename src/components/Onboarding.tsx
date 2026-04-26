'use client'

import { useState } from 'react'

interface Props {
  onComplete: (grade: number | null) => void
}

const GRADES = [7, 8, 9, 10, 11, 12]

export default function Onboarding({ onComplete }: Props) {
  const [selected, setSelected] = useState<number | null>(null)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">

      {/* Brand */}
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-black tracking-tight text-zinc-900">
          başarı<span className="text-[#0f766e]">x</span>
        </h1>
        <p className="mt-2 text-sm text-zinc-400 font-medium">Akıllı sınav takip asistanın</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-xs bg-white/65 backdrop-blur-md rounded-3xl shadow-[0_16px_48px_rgba(15,23,42,0.07)] border border-white/50 p-6 mb-5">
        <h2 className="text-xl font-extrabold text-zinc-900 tracking-tight mb-1">
          Kaçıncı sınıfdasın?
        </h2>
        <p className="text-sm text-zinc-400 mb-6">Sana özel çalışma planı hazırlayalım.</p>

        <div className="grid grid-cols-2 gap-2.5">
          {GRADES.map((grade) => (
            <button
              key={grade}
              onClick={() => setSelected(grade)}
              className={`h-14 rounded-2xl text-sm font-bold transition-all duration-150 ${
                selected === grade
                  ? 'bg-[#0f766e] text-white shadow-[0_4px_16px_rgba(15,118,110,0.35)] scale-[1.03]'
                  : 'bg-white/50 backdrop-blur-md text-zinc-700 border border-white/50 hover:border-[#0f766e] hover:text-[#0f766e] active:scale-95'
              }`}
            >
              {grade}. Sınıf
            </button>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="w-full max-w-xs mb-5">
        <button
          onClick={() => selected !== null && onComplete(selected)}
          disabled={selected === null}
          className={`w-full h-14 rounded-2xl text-base font-extrabold transition-all duration-150 ${
            selected !== null
              ? 'bg-[#0f766e]/75 hover:bg-[#0f766e]/85 backdrop-blur-md border border-white/30 text-white shadow-[0_8px_24px_rgba(15,118,110,0.25)] active:scale-[0.98]'
              : 'bg-zinc-100/60 backdrop-blur-md border border-white/40 text-zinc-400 cursor-not-allowed'
          }`}
        >
          Devam Et
        </button>
      </div>

      <button
        onClick={() => onComplete(null)}
        className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors underline underline-offset-4"
      >
        Atla, misafir olarak devam et
      </button>

    </div>
  )
}
