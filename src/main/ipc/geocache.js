import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { ipcMain, app } from 'electron'

// City geocoding lives in main for one hard reason: Nominatim's usage policy
// requires a descriptive User-Agent, and `User-Agent` is a forbidden header for
// the renderer's fetch. The persisted cache doubles as the map's seed data.
const USER_AGENT = 'booking-app-mac/1.0'
const THROTTLE_MS = 1050 // Nominatim asks for at most 1 request per second

function cachePath() {
  return join(app.getPath('userData'), 'geo_cache.json')
}

// The seed cache ships with the app: packaged builds get it via electron-builder
// extraResources, dev runs read it straight out of the repo.
function seedPath() {
  return app.isPackaged
    ? join(process.resourcesPath, 'geo_cache.json')
    : join(app.getAppPath(), 'resources', 'geo_cache.json')
}

let cache = null

function atomicWriteJson(path, obj) {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  try {
    writeFileSync(tmp, JSON.stringify(obj), 'utf8')
    renameSync(tmp, path)
  } catch (e) {
    if (existsSync(tmp)) { try { unlinkSync(tmp) } catch { /* ignore */ } }
    throw e
  }
}

function readJson(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

// Keys are "City||Country" — the same shape the webapp used, so a cache copied
// between the two apps stays valid.
function loadCache() {
  if (cache) return cache
  const stored = readJson(cachePath())
  if (stored) {
    cache = stored
    return cache
  }
  // First run: seed from the bundled snapshot so the map has pins immediately.
  cache = readJson(seedPath()) || {}
  try { atomicWriteJson(cachePath(), cache) } catch { /* a read-only cache still works in memory */ }
  return cache
}

function remember(key, value) {
  const c = loadCache()
  c[key] = value
  try { atomicWriteJson(cachePath(), c) } catch { /* keep the in-memory value */ }
}

// One request at a time, spaced by THROTTLE_MS. Callers that ask for the same
// key while it is in flight share the same promise rather than queueing twice.
const queue = []
const inFlight = new Map()
let processing = false

function pump() {
  if (processing || queue.length === 0) return
  processing = true
  const { city, country, key, resolve } = queue.shift()

  const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&format=json&limit=1`
  fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    .then(r => (r.ok ? r.json() : []))
    .then(data => {
      const result = data[0] ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : null
      // Null is cached too: a city Nominatim cannot place should not be retried
      // on every launch.
      remember(key, result)
      resolve(result)
    })
    .catch(() => resolve(null))
    .finally(() => {
      inFlight.delete(key)
      setTimeout(() => { processing = false; pump() }, THROTTLE_MS)
    })
}

function geocode(city, country) {
  const key = `${city}||${country}`
  const c = loadCache()
  if (key in c) return Promise.resolve(c[key])
  if (inFlight.has(key)) return inFlight.get(key)
  if (!city && !country) return Promise.resolve(null)

  const p = new Promise(resolve => {
    queue.push({ city, country, key, resolve })
    pump()
  })
  inFlight.set(key, p)
  return p
}

export function registerGeocacheIpc() {
  ipcMain.handle('geo:geocode', (_e, city, country) => geocode(city || '', country || ''))
  // The whole cache in one call, so the map can paint every known pin at once
  // instead of round-tripping per city.
  ipcMain.handle('geo:cacheSnapshot', () => ({ ...loadCache() }))
}
