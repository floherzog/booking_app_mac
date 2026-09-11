// Turning what the mail account knows into edits for the CSV.
//
// Deliberately pure and separate from the IMAP client: the fiddly part is not
// fetching messages, it is deciding which rows to touch and never clobbering
// something the user typed. Nothing here writes — it returns staged edits that go
// through the same Save button as a hand edit.
import { parseDate, formatDateDDMMYY } from './parseDate.js'
import { parseReplyStatus, composeReplyStatus } from './replyStatus.js'

// "Anna Müller <A.Mueller@Venue.DE>" → "a.mueller@venue.de". Addresses are the
// only join between a mailbox and a CSV row, so they have to compare stably.
export function normalizeAddress(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const angled = raw.match(/<([^>]+)>/)
  return (angled ? angled[1] : raw).trim().toLowerCase()
}

// Latest message per address. `messages` are { address, date, autoReply } in any
// order; only the newest per address survives.
export function latestByAddress(messages = []) {
  const out = new Map()
  for (const m of messages) {
    const address = normalizeAddress(m?.address)
    if (!address) continue
    const date = m?.date instanceof Date ? m.date : new Date(m?.date)
    if (Number.isNaN(date.getTime())) continue
    const prev = out.get(address)
    if (!prev || date > prev.date) out.set(address, { date, autoReply: !!m?.autoReply })
  }
  return out
}

// Only move a date forward. A venue emailed by hand and recorded in the CSV must
// not be rewound because the mailbox copy was deleted or the window was too short.
function isNewer(candidate, existingRaw) {
  const existing = parseDate(existingRaw)
  if (!existing) return true
  // Compare by day: the CSV only stores DD.MM.YY, so a same-day message is not news.
  const a = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate())
  const b = new Date(existing.getFullYear(), existing.getMonth(), existing.getDate())
  return a > b
}

// → [{ _idx, field, value, before }]. One entry per cell that would change.
//
// `sent` and `replies` are the maps from latestByAddress(). A row whose Email is
// blank, or which no message matches, is left alone entirely.
export function buildSyncEdits(rows = [], { sent = new Map(), replies = new Map() } = {}, opts = {}) {
  const { lastEmailed = 'imap', repliesMode = 'imap' } = opts
  const edits = []

  for (const row of rows) {
    const address = normalizeAddress(row?.['Email'])
    if (!address) continue

    if (lastEmailed === 'imap') {
      const hit = sent.get(address)
      if (hit && isNewer(hit.date, row['Last emailed'])) {
        edits.push({ _idx: row._idx, field: 'Last emailed', value: formatDateDDMMYY(hit.date), before: row['Last emailed'] || '' })
      }
    }

    if (repliesMode === 'imap') {
      const hit = replies.get(address)
      if (!hit) continue
      const current = parseReplyStatus(row['Status'])
      // A real reply always outranks an auto-reply already on record, even when
      // the auto-reply is newer — an auto-responder is not a response.
      const upgrade = current.kind !== 'reply' && !hit.autoReply
      if (!upgrade && !isNewer(hit.date, current.dateStr)) continue
      const value = composeReplyStatus(hit.autoReply ? 'auto-reply' : 'reply', formatDateDDMMYY(hit.date))
      if (value !== (row['Status'] || '')) {
        edits.push({ _idx: row._idx, field: 'Status', value, before: row['Status'] || '' })
      }
    }
  }

  return edits
}

// Oldest message worth fetching, as a Date. Scanning all of Sent on a long-lived
// account is slow and pointless — outreach older than this is already recorded.
export function scanSince(months = 24, now = new Date()) {
  const n = Number(months)
  const span = Number.isFinite(n) && n > 0 ? Math.min(n, 240) : 24
  const since = new Date(now)
  since.setMonth(since.getMonth() - span)
  return since
}
