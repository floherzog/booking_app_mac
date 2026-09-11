import { ipcMain } from 'electron'
import { readSettings } from '../settingsStore.js'
import { withImapClient, resolveSentMailbox, friendlyMailError } from './mailImap.js'
import { latestByAddress, buildSyncEdits, scanSince } from '../../core/mailSync.js'

// Reading the mail account to keep the CSV's date columns honest.
//
// Envelopes only — never message bodies. One pass over Sent gives "when did I last
// write to this venue", one pass over INBOX gives "when did they last answer".
// Nothing is written to the CSV here: the renderer stages the result as ordinary
// edits, and the Save button remains the only thing that touches the file.

// Headers that mark a machine-generated reply. RFC 3834 defines Auto-Submitted;
// the rest are what mail servers actually send.
const AUTO_HEADERS = ['auto-submitted', 'x-autoreply', 'x-autorespond', 'precedence', 'x-auto-response-suppress']

const AUTO_SUBJECT = /^\s*(re:\s*)?(auto(matic)?[-\s]?(reply|response)|out of office|abwesenheit|automatische\s+antwort|autoreply)/i

export function isAutoReply({ headers = '', subject = '' } = {}) {
  const h = String(headers || '').toLowerCase()
  // "Auto-Submitted: no" is the explicit marker for a human-written message.
  const submitted = h.match(/^auto-submitted:\s*(.+)$/m)
  if (submitted && submitted[1].trim().split(';')[0].trim() !== 'no') return true
  if (/^x-auto(reply|respond):/m.test(h)) return true
  if (/^precedence:\s*(auto_reply|bulk|junk)/m.test(h)) return true
  return AUTO_SUBJECT.test(String(subject || ''))
}

// Guard against a decade-old mailbox: envelopes are small, but a quarter of a
// million of them is still a long wait for no benefit.
const MAX_MESSAGES = 20000

async function collect(client, mailbox, since, extract) {
  let lock
  try {
    lock = await client.getMailboxLock(mailbox)
  } catch {
    return [] // mailbox gone or not selectable — not worth failing the whole sync
  }
  try {
    let uids = await client.search({ since }, { uid: true })
    if (!uids || !uids.length) return []
    if (uids.length > MAX_MESSAGES) uids = uids.slice(-MAX_MESSAGES) // newest wins
    const out = []
    for await (const msg of client.fetch(uids, { envelope: true, headers: AUTO_HEADERS }, { uid: true })) {
      const found = extract(msg)
      if (found) out.push(...found)
    }
    return out
  } finally {
    lock.release()
  }
}

function envelopeDate(msg) {
  return msg?.envelope?.date ? new Date(msg.envelope.date) : null
}

// Everyone a sent message went to — To and Cc, since a venue is sometimes cc'd.
function sentRecipients(msg) {
  const date = envelopeDate(msg)
  if (!date || Number.isNaN(date.getTime())) return null
  const people = [...(msg.envelope.to || []), ...(msg.envelope.cc || [])]
  return people
    .filter(p => p?.address)
    .map(p => ({ address: p.address, date }))
}

function inboxSenders(msg) {
  const date = envelopeDate(msg)
  if (!date || Number.isNaN(date.getTime())) return null
  const from = (msg.envelope.from || [])[0]
  if (!from?.address) return null
  const autoReply = isAutoReply({
    headers: msg.headers ? msg.headers.toString() : '',
    subject: msg.envelope.subject || '',
  })
  return [{ address: from.address, date, autoReply }]
}

// rows: a slim projection — { _idx, Email, 'Last emailed', Status }.
export async function runMailSync(rows = []) {
  const settings = readSettings()
  const sync = settings.mail?.sync || {}
  const wantSent = sync.lastEmailed === 'imap'
  const wantReplies = sync.replies === 'imap'
  if (!wantSent && !wantReplies) return { edits: [], scanned: { sent: 0, inbox: 0 }, skipped: 'off' }

  const since = scanSince(sync.months)

  return withImapClient(async (client, s) => {
    let sentMessages = []
    let inboxMessages = []

    if (wantSent) {
      const mailboxes = (await client.list()).map(m => ({ path: m.path, specialUse: m.specialUse }))
      const sentBox = resolveSentMailbox(mailboxes, s.mail?.sentMailbox)
      sentMessages = await collect(client, sentBox, since, sentRecipients)
    }
    if (wantReplies) {
      inboxMessages = await collect(client, 'INBOX', since, inboxSenders)
    }

    const edits = buildSyncEdits(rows, {
      sent: latestByAddress(sentMessages),
      replies: latestByAddress(inboxMessages),
    }, {
      lastEmailed: wantSent ? 'imap' : 'off',
      repliesMode: wantReplies ? 'imap' : 'off',
    })

    return { edits, scanned: { sent: sentMessages.length, inbox: inboxMessages.length }, since: since.toISOString() }
  })
}

export function registerMailSyncIpc() {
  ipcMain.handle('mail:sync', async (_e, rows) => {
    try {
      return await runMailSync(rows)
    } catch (e) {
      return { error: friendlyMailError(e), edits: [] }
    }
  })
}
