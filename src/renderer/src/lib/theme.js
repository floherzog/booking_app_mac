const KEY = 'booking_theme'

export function getStoredTheme() {
  try { return localStorage.getItem(KEY) || 'system' } catch { return 'system' }
}

export function applyTheme(pref) {
  const dark = pref === 'dark' ||
    (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.body.style.background = dark ? '#111827' : '#f9fafb'
}

export function setTheme(pref) {
  try { localStorage.setItem(KEY, pref) } catch { /* ignore */ }
  applyTheme(pref)
}

export function initTheme() {
  const pref = getStoredTheme()
  applyTheme(pref)
  // Keep in sync when OS setting changes and user preference is 'system'
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredTheme() === 'system') applyTheme('system')
  })
}
