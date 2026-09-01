// Thin async wrapper over the main-process settings store (settings:get/set).
// There is no renderer-side default: main owns the shape and merges the rules,
// so whatever comes back here is already complete.
export function getSettings() {
  return window.bookingApi.getSettings()
}

// Writes the whole settings object and returns what was actually persisted
// (main re-applies its defaults/merges), so callers should use the return value.
export function saveSettings(next) {
  return window.bookingApi.setSettings(next)
}
