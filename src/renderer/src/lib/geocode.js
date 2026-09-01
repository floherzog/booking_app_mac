// Geocoding runs in the main process (Nominatim requires a custom User-Agent,
// which the renderer's fetch is not allowed to set). Phase 3 wires this to the
// geo:geocode / geo:cacheSnapshot IPC channels; until then it degrades to "no
// coordinates yet", which the map handles.
export async function geocodeCity(city, country) {
  if (!window.bookingApi?.geocode) return null
  return window.bookingApi.geocode(city, country)
}

// The bundled seed cache ({ "City||Country": { lat, lng } | null }).
export async function loadSeedCache() {
  if (!window.bookingApi?.geoCacheSnapshot) return {}
  return window.bookingApi.geoCacheSnapshot()
}
