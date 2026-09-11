// Times the pure-core load pipeline at realistic list sizes.
//
// Why this exists: the app is used with lists an order of magnitude apart (a few
// hundred venues vs. a few thousand), and the cost of a re-render is paid on every
// cell edit. computeDuplicates was once ~400 ms at 3000 venues because it derived
// its per-name forms inside an O(n²) loop. Run this after touching src/core so a
// reintroduced quadratic cost shows up as a number rather than as "feels slow".
//
//   node scripts/bench-core.mjs
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { classifyBooking } = await import(join(ROOT, 'src/core/classify.js'))
const { computeNextBatch } = await import(join(ROOT, 'src/core/nextBatch.js'))
const { computeDuplicates } = await import(join(ROOT, 'src/core/duplicates.js'))
const { getMissingSeverity, APP_COLUMNS } = await import(join(ROOT, 'src/core/constants.js'))
const { DEFAULT_RULES } = await import(join(ROOT, 'src/core/rules.js'))
const { parseCsvText, serializeCsv } = await import(join(ROOT, 'src/core/csv.js'))

const CITIES = ['Berlin', 'Hamburg', 'Munich', 'Cologne', 'Leipzig', 'Vienna', 'Zurich', 'Prague',
  'Amsterdam', 'Rotterdam', 'Brussels', 'Paris', 'Lyon', 'Milan', 'Rome', 'Madrid', 'Barcelona',
  'Warsaw', 'Krakow', 'Copenhagen', 'Stockholm', 'Oslo', 'Helsinki', 'London', 'Manchester']
const COUNTRIES = ['Germany', 'Austria', 'Switzerland', 'Czechia', 'Netherlands', 'Belgium',
  'France', 'Italy', 'Spain', 'Poland', 'Denmark', 'Sweden', 'Norway', 'Finland', 'UK']
const TYPES = ['main', 'main', 'main', 'festival', 'dead']

function d(offsetDays) {
  const t = new Date()
  t.setDate(t.getDate() - offsetDays)
  const p = n => String(n).padStart(2, '0')
  return `${p(t.getDate())}.${p(t.getMonth() + 1)}.${String(t.getFullYear()).slice(2)}`
}

function makeRows(n) {
  const rows = []
  for (let i = 0; i < n; i++) {
    const row = {}
    for (const c of APP_COLUMNS) row[c.key] = ''
    row['Venue'] = `Venue ${i} ${i % 7 === 0 ? 'Club' : 'Halle'}`
    row['Band'] = i % 2 ? 'Band A' : 'Band B'
    row['Type'] = TYPES[i % TYPES.length]
    row['City'] = CITIES[i % CITIES.length]
    row['Country'] = COUNTRIES[i % COUNTRIES.length]
    row['Contact'] = i % 9 === 0 ? '' : `Person ${i}`
    row['Email'] = i % 11 === 0 ? '' : `v${i}@example.com`
    row['Last emailed'] = i % 3 === 0 ? d(20 + (i % 300)) : ''
    row['Follow Up Date'] = i % 5 === 0 ? d(-(i % 40)) : ''
    row['Last played'] = i % 6 === 0 ? d(200 + (i % 900)) : ''
    row['Total emails'] = String(i % 9)
    row['Auto'] = i % 4 === 0 ? 'TRUE' : ''
    rows.push(row)
  }
  return rows
}

function time(label, fn) {
  const t0 = performance.now()
  const out = fn()
  console.log(`  ${label.padEnd(32)} ${(performance.now() - t0).toFixed(1).padStart(8)} ms`)
  return out
}

for (const n of [250, 1000, 3000]) {
  console.log(`\n=== ${n} venues ===`)
  const csv = serializeCsv(makeRows(n))
  console.log(`  csv size                         ${(csv.length / 1024).toFixed(0).padStart(8)} KB`)

  const t0 = performance.now()
  const raw = await parseCsvText(csv)
  console.log(`  ${'parseCsvText'.padEnd(32)} ${(performance.now() - t0).toFixed(1).padStart(8)} ms`)

  const today = new Date()
  const classified = time('classifyBooking x N', () =>
    raw.map((r, i) => ({ ...r, _idx: i, _status: classifyBooking(r, today, DEFAULT_RULES) })))
  const nextBatchSet = time('computeNextBatch', () => computeNextBatch(classified, today, DEFAULT_RULES))
  const staged = time('stage _nextBatch/_missing', () =>
    classified.map(r => ({ ...r, _nextBatch: nextBatchSet.has(r._idx), _missingSeverity: getMissingSeverity(r) })))
  time('computeDuplicates', () => computeDuplicates(staged, new Set()))
}
