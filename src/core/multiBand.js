// Multi-band mode: one CSV per band (plus one for venues without a band), shown
// as a single list in which a venue can carry several bands.
//
// In memory nothing changes shape: every row is still one venue × band entry,
// exactly one line of one CSV, so classification, drafting, sending and the
// draft log all keep working per band. What this module adds is the glue:
//   - which entries are the same venue (`_venueId`),
//   - which fields that venue shares across its bands,
//   - which file each entry is written to, and back to one CSV again.
//
// Pure on purpose — the file system is main's job, and the tests drive this.
import { parseDate } from './parseDate.js'

// Raw venue data. Identical on every band's entry for the same venue; editing it
// on one band edits it on all of them. Every other column is per band.
export const SHARED_FIELDS = ['Venue', 'Type', 'City', 'Country', 'Contact', 'Email', 'Website', 'Time Frame']
const SHARED = new Set(SHARED_FIELDS)

export function isSharedField(field) {
  return SHARED.has(field)
}

function normalize(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim() }

// Same normalisation the duplicate detector buckets by: case and whitespace
// never decide whether two entries are one venue.
export function venueKey(row) {
  const venue = normalize(row?.['Venue'])
  if (!venue) return ''
  return `${venue}|${normalize(row?.['City'])}`
}

// → the same rows, each with a `_venueId`.
//
// Entries are linked only when their bands differ — in multi-band mode a band is
// a file, and a venue appears at most once per band. Two same-named rows of one
// band stay two venues (as they always were; the duplicate detector deals with
// those). When a key is ambiguous the entries link in order. A nameless row, or
// one without a band, is always a venue of its own. With `enabled` false
// (normal mode) nothing links: every row is its own venue.
export function linkVenues(rows, enabled = true) {
  let counter = 0
  const groupsByKey = new Map() // key → [{ id, bands: Set }]
  return rows.map(r => {
    const key = venueKey(r)
    const band = normalize(r?.['Band'])
    if (!enabled || !key || !band) return { ...r, _venueId: `v${counter++}` }
    const groups = groupsByKey.get(key) || []
    let group = groups.find(g => !g.bands.has(band))
    if (!group) {
      group = { id: `v${counter++}`, bands: new Set() }
      groups.push(group)
      groupsByKey.set(key, groups)
    }
    group.bands.add(band)
    return { ...r, _venueId: group.id }
  })
}

// _venueId → [entries], in row order.
export function groupByVenue(rows) {
  const out = new Map()
  for (const r of rows) {
    const list = out.get(r._venueId)
    if (list) list.push(r)
    else out.set(r._venueId, [r])
  }
  return out
}

// When the band files disagree about a venue's shared data (edited outside the
// app, or two rows that were separate before the split), pick one value per
// field and return the edits that make the others match.
//
// The winner is the entry emailed most recently — the one most likely to have
// been kept up to date — and an empty value never beats a filled-in one.
// → [{ _idx, field, value, before }], the shape mail sync stages.
export function reconcileShared(rows) {
  const edits = []
  for (const entries of groupByVenue(rows).values()) {
    if (entries.length < 2) continue
    const byRecency = [...entries].sort((a, b) => {
      const da = parseDate(a['Last emailed'])?.getTime() ?? -Infinity
      const db = parseDate(b['Last emailed'])?.getTime() ?? -Infinity
      return db - da
    })
    for (const field of SHARED_FIELDS) {
      const values = new Set(entries.map(e => e[field] || ''))
      if (values.size < 2) continue
      const winner = byRecency.find(e => (e[field] || '').trim()) || byRecency[0]
      const value = winner[field] || ''
      for (const e of entries) {
        if ((e[field] || '') !== value) edits.push({ _idx: e._idx, field, value, before: e[field] || '' })
      }
    }
  }
  return edits
}

// A file name for a band. Readable rather than safe-at-all-costs: umlauts and
// spaces are fine on macOS, path separators and Finder-hostile characters are not.
export function bandSlug(band) {
  const s = String(band || '')
    .replace(/[/\\:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
  return s || 'band'
}

function joinPath(dir, name) {
  return `${String(dir || '').replace(/\/+$/, '')}/${name}`
}

// macOS volumes are case-insensitive by default, so "Band A" and "band a" must
// never be given the same file.
function takenPaths(manifest) {
  return new Set([manifest.unassigned, ...Object.values(manifest.files || {})]
    .filter(Boolean).map(p => p.toLowerCase()))
}

function uniquePath(dir, stem, taken) {
  let path = joinPath(dir, `${stem}.csv`)
  let n = 2
  while (taken.has(path.toLowerCase())) path = joinPath(dir, `${stem} ${n++}.csv`)
  return path
}

// The manifest for a fresh split of `<dir>/<base>.csv`.
export function emptyManifest(dir, base) {
  return { dir, base, files: {}, unassigned: joinPath(dir, `${base}-unassigned.csv`) }
}

// The file a band's entries go to, adding one to the manifest if the band is new.
// Returns the (possibly extended) manifest alongside, never mutates it.
export function fileForBand(manifest, band) {
  const name = String(band || '').trim()
  if (!name) return { path: manifest.unassigned, manifest }
  const existing = manifest.files?.[name]
  if (existing) return { path: existing, manifest }
  const path = uniquePath(manifest.dir, `${manifest.base}-${bandSlug(name)}`, takenPaths(manifest))
  return { path, manifest: { ...manifest, files: { ...manifest.files, [name]: path } } }
}

// Every entry to the file of the band in its `Band` column. Every file the
// manifest knows is present in the result, empty or not — a band whose last
// venue moved away still has a file, just with only the header row.
// → { files: Map(path → rows), manifest }
export function routeRows(rows, manifest) {
  let m = manifest
  const files = new Map([[m.unassigned, []], ...Object.values(m.files || {}).map(p => [p, []])])
  for (const r of rows) {
    const routed = fileForBand(m, r['Band'])
    m = routed.manifest
    if (!files.has(routed.path)) files.set(routed.path, [])
    files.get(routed.path).push(r)
  }
  return { files, manifest: m }
}

// Back to one CSV: one line per entry, so a venue booked for two bands appears
// twice — which is how the single-file format has always expressed that. A
// venue's lines are kept next to each other.
export function mergeRows(rows) {
  const out = []
  for (const entries of groupByVenue(rows).values()) out.push(...entries)
  return out
}

export function isMultiBand(settings) {
  return !!settings?.storage?.multiBand?.enabled && settings?.storage?.adapter !== 'github'
}
