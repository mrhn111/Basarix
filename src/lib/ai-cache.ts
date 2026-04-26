export const AI_CACHE_KEY = 'basarix_ai_cache'
export const AI_LAST_CALLED_KEY = 'basarix_ai_last_called'

export function clearAiCache() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(AI_CACHE_KEY)
  }
}

export function hasCalledAiToday(): boolean {
  if (typeof window === 'undefined') return false
  const stored = localStorage.getItem(AI_LAST_CALLED_KEY)
  if (!stored) return false
  return stored === new Date().toISOString().slice(0, 10)
}

export function markAiCalled(): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(AI_LAST_CALLED_KEY, new Date().toISOString().slice(0, 10))
}
