// Geocoding runs in the main process: Nominatim's usage policy wants a
// descriptive User-Agent, and `User-Agent` is a forbidden header for the
// renderer's fetch. Main also owns the cache file, the 1-req/sec throttle and
// the bundled seed data — this module is just the bridge.

// → { lat, lng } | null. Cached results (including "not found") return instantly.
export async function geocodeCity(city, country) {
  try {
    return await window.bookingApi.geocode(city, country)
  } catch {
    return null
  }
}

// The whole persisted cache ({ "City||Country": { lat, lng } | null }), seeded
// from the app's bundled snapshot on first run.
export async function loadSeedCache() {
  try {
    return await window.bookingApi.geoCacheSnapshot()
  } catch {
    return {}
  }
}
