import { ipcMain } from 'electron'
import { ImapFlow } from 'imapflow'
import { readSettings } from '../settingsStore.js'
import { getSecret } from '../secrets.js'
import { assetPath } from './templates.js'
import { buildDraftMime } from '../mime.js'
import { htmlToText } from '../../core/htmlText.js'

// Drafts are created by APPENDing a message to the Drafts mailbox. That is the
// only way to get perfect formatting into Mail.app silently and in bulk — the
// AppleScript path (mailAppleScript.js) is a zero-config fallback for one draft.

const APPLE_ID_URL = 'https://appleid.apple.com'

// iCloud rejects the account password outright — only an app-specific password
// works — and the raw IMAP response is not something to show a user.
export function friendlyMailError(e) {
  const msg = String(e?.responseText || e?.message || e)
  if (/AUTHENTICATIONFAILED|Invalid credentials|LOGIN failed/i.test(msg)) {
    return `The mail server rejected those credentials. iCloud needs an app-specific password (not your Apple ID password) — create one at ${APPLE_ID_URL} under Sign-In and Security, then paste it into Settings → Mail.`
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) return 'Could not find that mail server — check the host name in Settings → Mail.'
  if (/ECONNREFUSED/i.test(msg)) return 'The mail server refused the connection — check the host and port in Settings → Mail.'
  if (/ETIMEDOUT|timeout/i.test(msg)) return 'The mail server did not respond. Check your connection and the host/port in Settings → Mail.'
  if (/certificate/i.test(msg)) return `The mail server's TLS certificate could not be verified: ${msg}`
  return msg
}

// The mailbox to append into: what the user chose, else the one the server flags
// as SPECIAL-USE \Drafts, else the conventional name.
export function resolveDraftsMailbox(mailboxes, configured) {
  if (configured) return configured
  const special = (mailboxes || []).find(m => m.specialUse === '\\Drafts')
  if (special) return special.path
  const named = (mailboxes || []).find(m => (m.path || '').toLowerCase() === 'drafts')
  return named ? named.path : 'Drafts'
}

function mailboxSummary(list) {
  return (list || []).map(m => ({ path: m.path, specialUse: m.specialUse || '' }))
}

// --- the two operations, against any client that quacks like ImapFlow --------
// Split out so the tests can drive them with a recording double; the handlers
// below supply the real connection.

export async function testConnectionWith(client, settings) {
  const mailboxes = mailboxSummary(await client.list())
  return { mailboxes, suggestion: resolveDraftsMailbox(mailboxes, settings.mail?.draftsMailbox) }
}

export async function appendDraftWith(client, settings, { to, subject, html, cids = [] }, resolveAsset = assetPath) {
  const mail = settings.mail || {}

  // cids arrive as [{ cid, assetId }] from renderEmailHtml; main is the only
  // side that knows where the asset files actually live.
  const inlineAssets = []
  for (const { cid, assetId } of cids) {
    const path = resolveAsset(assetId)
    if (path) inlineAssets.push({ path, cid })
  }

  const mime = await buildDraftMime({
    from: { name: mail.fromName, address: mail.fromAddress || mail.user },
    to,
    subject,
    html,
    text: htmlToText(html),
    inlineAssets,
  })

  const mailbox = resolveDraftsMailbox(mailboxSummary(await client.list()), mail.draftsMailbox)

  // \Draft is essential: without it Mail.app files the message as received mail
  // rather than an editable draft. \Seen stops it counting as unread.
  const res = await client.append(mailbox, mime, ['\\Draft', '\\Seen'])
  return { mailbox, uid: res?.uid ?? null }
}

// A connection per call takes 1–2s. Pooling is a later optimization; correctness
// and never leaving a socket open matter more here.
async function withClient(fn) {
  const settings = readSettings()
  const { host, port, user } = settings.mail || {}
  if (!host) throw new Error('No IMAP server configured. Fill in Settings → Mail.')
  if (!user) throw new Error('No IMAP username configured. Fill in Settings → Mail.')

  const pass = getSecret('imapPassword')
  if (!pass) throw new Error('No mail password stored. Add one in Settings → Mail.')

  const client = new ImapFlow({
    host,
    port: Number(port) || 993,
    secure: true,
    auth: { user, pass },
    logger: false,
    // Fail fast rather than hanging the UI on a wrong host.
    socketTimeout: 30000,
  })

  try {
    await client.connect()
    return await fn(client, settings)
  } catch (e) {
    throw new Error(friendlyMailError(e))
  } finally {
    try { await client.logout() } catch { /* already gone */ }
  }
}

export function registerMailImapIpc() {
  // → { mailboxes: [{ path, specialUse }], suggestion }
  ipcMain.handle('mail:testConnection', () => withClient(testConnectionWith))

  // { to, subject, html, cids } → { mailbox, uid }
  ipcMain.handle('mail:appendDraft', (_e, payload) =>
    withClient((client, settings) => appendDraftWith(client, settings, payload)),
  )
}
