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

// Two venue names count as similar if one is a substring of the other (spaced or
// not), OR all words of the shorter name appear in the longer one (catches inserted
// words like "Jazz Gütersloh" vs "Jazz in Gütersloh"), OR they overlap heavily.
function isSimilar(nA, nB) {
  const cA = clean(nA)
  const cB = clean(nB)
  if (!cA || !cB) return false
  const sA = cA.replace(/\s/g, '')
  const sB = cB.replace(/\s/g, '')
  if (cA.includes(cB) || cB.includes(cA) || sA.includes(sB) || sB.includes(sA)) return true

  const a = tokenSet(cA)
  const b = tokenSet(cB)
  const [small, big] = a.size <= b.size ? [a, b] : [b, a]
  const shared = [...small].filter(t => big.has(t)).length
  if (shared === small.size) return true // every word of the shorter name is present in the longer

  const union = new Set([...a, ...b]).size
  return union > 0 && shared / union >= 0.6 // mostly the same words (handles reordering/typos)
}

export function computeDuplicates(rows, dismissed = new Set()) {
  const byCity = {}
  rows.forEach(r => {
    const city = normalize(r['City'])
    if (!city) return
    ;(byCity[city] = byCity[city] || []).push(r)
  })

  const dups = new Set()
  const partners = {}

  Object.values(byCity).forEach(group => {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const nA = normalize(group[i]['Venue'])
        const nB = normalize(group[j]['Venue'])
        if (!nA || !nB) continue
        if (isSimilar(nA, nB) && !dismissed.has(pairKey(group[i], group[j]))) {
          dups.add(group[i]._idx)
          dups.add(group[j]._idx)
          ;(partners[group[i]._idx] = partners[group[i]._idx] || []).push(group[j])
          ;(partners[group[j]._idx] = partners[group[j]._idx] || []).push(group[i])
        }
      }
    }
  })
  return { dups, partners }
}
