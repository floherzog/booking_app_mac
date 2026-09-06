import { ipcMain } from 'electron'
import nodemailer from 'nodemailer'
import { readSettings } from '../settingsStore.js'
import { getSecret } from '../secrets.js'
import { assetPath } from './templates.js'
import { buildOutgoingMime, appendToSent, friendlyMailError } from './mailImap.js'

// Sending is the one irreversible thing this app does, so it deliberately reuses
// the draft path's MIME bytes verbatim (buildOutgoingMime): what goes out is the
// message you would have reviewed in Drafts, not a second rendering of it.

// iCloud's SMTP host follows from its IMAP one; anything else the user fills in.
export function defaultSmtpHost(imapHost) {
  const h = String(imapHost || '')
  if (/mail\.me\.com$/i.test(h)) return 'smtp.mail.me.com'
  return h.replace(/^imap\./i, 'smtp.')
}

export function smtpConfig(settings) {
  const mail = settings.mail || {}
  const host = mail.smtpHost || defaultSmtpHost(mail.host)
  const port = Number(mail.smtpPort) || 587
  if (!host) throw new Error('No SMTP server configured. Fill in Settings → Mail.')
  if (!mail.user) throw new Error('No mail username configured. Fill in Settings → Mail.')
  const pass = getSecret('imapPassword')
  if (!pass) throw new Error('No mail password stored. Add one in Settings → Mail.')
  return {
    host,
    port,
    // 465 is implicit TLS; 587 starts plain and upgrades with STARTTLS.
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: mail.user, pass },
  }
}

// Split from the handler so tests can drive it with a fake transport.
export async function sendMailWith(transport, settings, payload, { resolveAsset = assetPath, fileToSent = appendToSent } = {}) {
  const mail = settings.mail || {}
  const from = mail.fromAddress || mail.user
  if (!payload?.to) throw new Error('No recipient address.')

  const mime = await buildOutgoingMime(settings, payload, resolveAsset)
  const info = await transport.sendMail({
    raw: mime,
    // The envelope has to be given explicitly with `raw`: nodemailer does not
    // parse the headers back out of a prebuilt message.
    envelope: { from, to: payload.to },
  })

  // Best-effort: a message that was accepted by the server is sent whether or
  // not it also shows up in Sent.
  let sentMailbox = null
  try {
    const filed = await fileToSent(mime)
    sentMailbox = filed?.mailbox || null
  } catch {
    /* the copy in Sent is a convenience, not part of sending */
  }

  return { accepted: info?.accepted || [payload.to], messageId: info?.messageId || null, sentMailbox }
}

export async function sendMailNow(payload) {
  const settings = readSettings()
  const transport = nodemailer.createTransport(smtpConfig(settings))
  try {
    return await sendMailWith(transport, settings, payload)
  } catch (e) {
    throw new Error(friendlyMailError(e))
  } finally {
    transport.close()
  }
}

export function registerMailSmtpIpc() {
  // { to, subject, html, cids } → { accepted, messageId, sentMailbox }
  ipcMain.handle('mail:send', (_e, payload) => sendMailNow(payload))
}
