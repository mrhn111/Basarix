'use client'

import { useState } from 'react'
import Onboarding from '@/components/Onboarding'
import HomeScreen from '@/components/Home'

type AppState = 'loading' | 'onboarding' | 'home'

export default function Page() {
  const [appState, setAppState] = useState<AppState>(() => {
    if (typeof window === 'undefined') return 'loading'
    return localStorage.getItem('basarix_onboarded') === 'true' ? 'home' : 'onboarding'
  })

  const handleOnboardingComplete = (selectedGrade: number | null) => {
    if (selectedGrade !== null) {
      localStorage.setItem('basarix_grade', selectedGrade.toString())
    }
    localStorage.setItem('basarix_onboarded', 'true')
    setAppState('home')
  }

  if (appState === 'loading') return null
  if (appState === 'onboarding') return <Onboarding onComplete={handleOnboardingComplete} />
  return <HomeScreen />
}
