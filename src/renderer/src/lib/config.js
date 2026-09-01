// Renderer-side app config. Phase 2 moves this onto the main-process settings
// store (settings:get/set); until then it is a local, machine-only stash with
// no bundled credentials of any kind.
const STORAGE_KEY = 'booking_app_config'

export const DEFAULT_CONFIG = {
  bands: [],
}

export function getConfig() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return { ...DEFAULT_CONFIG, ...JSON.parse(stored) }
  } catch {
    // ignore
  }
  return { ...DEFAULT_CONFIG }
}

export function saveConfig(config) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)) } catch { /* ignore */ }
}
