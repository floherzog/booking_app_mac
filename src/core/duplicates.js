// Pure duplicate detection. Dismissed pairs live in the settings store (main
// process) and are passed in as a Set of pair keys.
export function pairKey(r1, r2) {
  const k = r => `${(r['City'] || '').toLowerCase()}:::${(r['Venue'] || '').toLowerCase()}`
  return [k(r1), k(r2)].sort().join('|||')
}

export function dismissPair(dismissed, r1, r2) {
  const next = new Set(dismissed)
  next.add(pairKey(r1, r2))
  return next
}

function normalize(s) { return (s || '').toLowerCase().replace(/\s+/g, ' ').trim() }

// Lowercase, drop punctuation (so "Jazz in Gütersloh?" matches "Jazz Gütersloh"),
// collapse whitespace. Keeps unicode letters/numbers (ü, ß, etc.).
function clean(s) {
  return normalize(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

function tokenSet(s) { return new Set(clean(s).split(' ').filter(Boolean)) }

// Everything comparing two venue names needs the same three derived forms. They
// are pure functions of the name, so at N venues per city this is computed N
// times instead of N² — the inner loop below used to re-derive them per pair,
// which is what made a 3000-venue list cost ~400 ms per recompute.
function prepare(name) {
  const cleaned = clean(name)
  return {
    cleaned,
    squashed: cleaned.replace(/\s/g, ''),
    tokens: new Set(cleaned.split(' ').filter(Boolean)),
  }
}

// Two venue names count as similar if one is a substring of the other (spaced or
// not), OR all words of the shorter name appear in the longer one (catches inserted
// words like "Jazz Gütersloh" vs "Jazz in Gütersloh"), OR they overlap heavily.
function isSimilarPrepared(A, B) {
  const { cleaned: cA, squashed: sA, tokens: a } = A
  const { cleaned: cB, squashed: sB, tokens: b } = B
  if (!cA || !cB) return false
  if (cA.includes(cB) || cB.includes(cA) || sA.includes(sB) || sB.includes(sA)) return true

  const [small, big] = a.size <= b.size ? [a, b] : [b, a]
  let shared = 0
  for (const t of small) if (big.has(t)) shared++
  if (shared === small.size) return true // every word of the shorter name is present in the longer

  const union = a.size + b.size - shared
  return union > 0 && shared / union >= 0.6 // mostly the same words (handles reordering/typos)
}

// Kept for callers that compare two raw names directly.
export function isSimilar(nA, nB) {
  return isSimilarPrepared(prepare(nA), prepare(nB))
}

export function computeDuplicates(rows, dismissed = new Set()) {
  const byCity = new Map()
  rows.forEach(r => {
    const city = normalize(r['City'])
    if (!city) return
    const venue = normalize(r['Venue'])
    if (!venue) return // a nameless row can never match, so never bucket it
    // NB: the dismissal key must match pairKey() byte for byte, and pairKey uses
    // the *raw* lowercased fields — not the whitespace-collapsed ones used for
    // bucketing — so a venue with a double space still matches its stored key.
    const key = `${(r['City'] || '').toLowerCase()}:::${(r['Venue'] || '').toLowerCase()}`
    const entry = { row: r, prepared: prepare(venue), key }
    const group = byCity.get(city)
    if (group) group.push(entry)
    else byCity.set(city, [entry])
  })

  const dups = new Set()
  const partners = {}

  for (const group of byCity.values()) {
    for (let i = 0; i < group.length; i++) {
      const A = group[i]
      for (let j = i + 1; j < group.length; j++) {
        const B = group[j]
        if (!isSimilarPrepared(A.prepared, B.prepared)) continue
        // Only build the (comparatively expensive) pair key once a pair matches.
        const pair = A.key <= B.key ? `${A.key}|||${B.key}` : `${B.key}|||${A.key}`
        if (dismissed.has(pair)) continue
        dups.add(A.row._idx)
        dups.add(B.row._idx)
        ;(partners[A.row._idx] = partners[A.row._idx] || []).push(B.row)
        ;(partners[B.row._idx] = partners[B.row._idx] || []).push(A.row)
      }
    }
  }
  return { dups, partners }
}
