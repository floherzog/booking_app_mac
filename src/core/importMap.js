import { normalizeRow } from './csv.js'
import { APP_COLUMNS } from './constants.js'

// Extra header spellings a user's CSV might use, mapped to our canonical key.
// Keys/values are compared in normalized form (lowercase, alphanumerics only).
const ALIASES = {
  Venue: ['venuename', 'name', 'location', 'club', 'place'],
  Band: ['artist', 'act', 'project', 'group'],
  City: ['town'],
  Country: ['land', 'nation'],
  Contact: ['contactperson', 'person', 'promoter', 'booker'],
  Email: ['email', 'emailaddress', 'mail', 'mailaddress', 'contactemail'],
  Website: ['url', 'web', 'site', 'homepage', 'link'],
  'Time Frame': ['timeframe', 'availability', 'when'],
  Dates: ['date', 'tourdates', 'gigdates'],
  Text: ['outreachtext', 'message', 'body', 'pitch', 'emailtext'],
  'Last emailed': ['lastemailed', 'lastcontacted', 'emailedon', 'lastcontact', 'lastemail'],
  'Follow Up Date': ['followupdate', 'followup', 'nextfollowup', 'remind', 'reminderdate'],
  frequency: ['frequency', 'cadence', 'interval'],
  'Last played': ['lastplayed', 'lastgig', 'lastshow', 'played'],
  Status: ['replystatus', 'reply', 'response'],
  Note: ['note', 'notes', 'internalnote', 'comment', 'comments', 'remark'],
  'Total emails': ['totalemails', 'emailssent', 'emails', 'emailcount', 'contactcount', 'timesemailed', 'numemails', 'allemails'],
  'Recent emails': ['recentemails', 'emailssincereply', 'recentemailssent', 'recent'],
  Draft: ['draft'],
  Auto: ['auto', 'autosend'],
  filler: ['filler'],
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Build { appKey -> sourceHeader | '' } by matching each app column against the
// file's headers: exact normalized header == key, else an alias hit.
export function guessMapping(sourceHeaders = []) {
  const normed = sourceHeaders.map(h => ({ raw: h, n: norm(h) }))
  const used = new Set()
  const mapping = {}
  for (const { key } of APP_COLUMNS) {
    const wanted = [norm(key), ...(ALIASES[key] || [])]
    const hit = normed.find(h => !used.has(h.raw) && wanted.includes(h.n))
    mapping[key] = hit ? hit.raw : ''
    if (hit) used.add(hit.raw)
  }
  return mapping
}

// Turn source rows into canonical rows: every APP_COLUMNS key present (value from
// the mapped source header, or ''), then the managed-column guarantee applied so
// Papa.unparse always emits every header even for an all-empty column.
export function applyMapping(sourceRows = [], mapping = {}) {
  return sourceRows.map(src => {
    const out = {}
    for (const { key } of APP_COLUMNS) {
      const from = mapping[key]
      out[key] = (from && src[from] != null) ? String(src[from]) : ''
    }
    return normalizeRow(out)
  })
}

// Count how many source headers ended up mapped to an app column.
export function mappedCount(mapping = {}) {
  return Object.values(mapping).filter(Boolean).length
}

// Does this file already use the app's own column names?
//
// Picking a CSV on the first run configures the storage adapter directly, with no
// mapping step — which is right for a file the app (or the webapp, or the scripts)
// wrote, and silently wrong for someone's own spreadsheet, where every column
// lands blank. These six are the ones the app cannot work without; a file missing
// any of them needs the import wizard's mapping step instead.
const SIGNATURE_COLUMNS = ['Venue', 'Band', 'City', 'Country', 'Email', 'Last emailed']

export function looksLikeAppCsv(headers = []) {
  const present = new Set((headers || []).map(h => String(h || '').trim()))
  return SIGNATURE_COLUMNS.every(c => present.has(c))
}
