// Proves the CSV contract is still byte-compatible with the webapp.
//
// 1. A fixture covering all 22 columns, umlauts, embedded delimiters/newlines
//    and the Draft/Auto TRUE-or-empty convention round-trips through core/csv.js
//    unchanged.
// 2. The same fixture, run through the WEBAPP's own parse/serialize, produces an
//    identical byte string — so the file stays readable by the webapp and the
//    OpenClaw scripts.
//
// Run: node scripts/verify-csv-roundtrip.mjs
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsvText, serializeCsv } from '../src/core/csv.js'
import { APP_COLUMNS } from '../src/core/constants.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEBAPP = join(HERE, '..', '..', 'booking_app')

const HEADER = APP_COLUMNS.map(c => c.key).join(';')
const ROWS = [
  ['Jazzclub Gütersloh', 'Die Band', 'club', 'Gütersloh', 'Germany', 'Frau Müller', 'a@b.de', 'https://x.de', 'Frühjahr', 'Mär–Mai', 'Hallo!', '15.03.24', '01.06.25', '2 months', '', 'reply: 20.03.24', 'anrufen', '3', '1', 'TRUE', '', ''],
  ['The "Old" Vic; Annex', 'Band Two', 'festival', 'London', 'UK', '', 'c@d.uk', '', 'Summer', 'Jun 2026', 'line one\nline two', '', '', '', '01.01.23', '', '', '0', '0', '', 'TRUE', 'TRUE'],
]

function csvEscape(v) {
  return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}
const FIXTURE = [HEADER, ...ROWS.map(r => r.map(csvEscape).join(';'))].join('\n')

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`)
    process.exit(1)
  }
  console.log(`ok — ${msg}`)
}

const parsed = await parseCsvText(FIXTURE)
assert(parsed.length === 2, 'core parses both fixture rows')
assert(Object.keys(parsed[0]).length === 22, 'core rows carry all 22 columns')
assert(parsed[0].Draft === 'TRUE' && parsed[0].Auto === '', 'Draft/Auto keep the TRUE / empty convention')
assert(parsed[1].Note === '' && parsed[1].Text === 'line one\nline two', 'embedded newline survives the round trip')

const core = serializeCsv(parsed)
assert(core === FIXTURE, 'core round-trip is byte-identical to the fixture')

const dirty = parsed.map((r, i) => ({ ...r, _idx: i, _status: 'SEND', _nextBatch: true, _missingSeverity: 0 }))
assert(serializeCsv(dirty) === FIXTURE, 'underscore-prefixed internal fields are stripped on serialize')

// --- cross-check against the webapp -----------------------------------------
if (!existsSync(join(WEBAPP, 'src', 'lib', 'pushCsv.js'))) {
  console.log('skip — webapp not found next to this repo; cross-check not run')
  process.exit(0)
}

const webParse = await import(pathToFileURL(join(WEBAPP, 'src', 'lib', 'fetchCsv.js')).href)
const webSerialize = await import(pathToFileURL(join(WEBAPP, 'src', 'lib', 'pushCsv.js')).href)

const webRows = await webParse.parseCsvText(FIXTURE)
assert(JSON.stringify(webRows) === JSON.stringify(parsed), 'webapp and core parse the fixture identically')
assert(webSerialize.serializeCsv(parsed) === core, 'webapp and core serialize identically')
assert(webSerialize.serializeCsv(webRows) === FIXTURE, 'webapp round-trips the fixture unchanged too')

console.log('\nCSV contract verified: byte-compatible with the webapp.')
