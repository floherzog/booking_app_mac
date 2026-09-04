// A venue's `Type` is a free CSV column, but three values carry behaviour in
// classify.js: 'dead' excludes the venue entirely and 'festival' gates it on the
// festival booking window. 'main' is the ordinary case. Everything else is just
// a label the user made up, and the dropdown exists to stop typos from silently
// turning a "dead" venue back into an active one.
export const DEFAULT_VENUE_TYPES = ['main', 'festival', 'dead']

// Types whose value changes how the app classifies a row. Surfaced in the
// settings UI so the user knows which names are more than labels.
export const BEHAVIORAL_VENUE_TYPES = ['festival', 'dead']

export function normalizeVenueTypes(types) {
  const seen = new Set()
  const out = []
  for (const t of types || []) {
    const name = String(typeof t === 'string' ? t : (t?.name || '')).trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

// The options offered in Type dropdowns: the union of the managed list and any
// value already present in the rows, so no existing venue's type can vanish.
// Mirrors effectiveBandOptions in bands.js.
export function effectiveTypeOptions(rows, managed = []) {
  const out = normalizeVenueTypes(managed)
  const seen = new Set(out.map(t => t.toLowerCase()))
  for (const r of rows || []) {
    const t = String(r?.['Type'] || '').trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out.sort((a, b) => a.localeCompare(b))
}
