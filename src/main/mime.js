import MailComposer from 'nodemailer/lib/mail-composer/index.js'

// nodemailer is used purely as a MIME writer here — no transport is ever
// created, nothing is sent. The RFC822 buffer this produces is handed to
// IMAP APPEND, which is what puts the message in the Drafts mailbox.

function addressOf({ name, address }) {
  if (!address) return undefined
  return name ? { name, address } : address
}

// { from: { name, address }, to, subject, html, text, inlineAssets, attachments }
//   inlineAssets: [{ path, cid }]  → embedded and referenced as cid:<cid>
//   attachments:  [{ path, filename }] → ordinary attachments
// → Promise<Buffer> of the complete RFC822 message.
export function buildDraftMime({ from, to, subject, html, text, inlineAssets = [], attachments = [] }) {
  const mail = {
    from: addressOf(from || {}),
    to,
    subject: subject || '',
    html: html || '',
    // A text/plain alternative keeps the draft readable in clients that refuse
    // HTML, and stops spam filters treating it as HTML-only.
    text: text || '',
    attachments: [
      ...inlineAssets.map(a => ({
        path: a.path,
        cid: a.cid,
        // Without this the image shows up as a separate attachment instead of
        // rendering where the <img> sits.
        contentDisposition: 'inline',
      })),
      ...attachments.map(a => ({ path: a.path, filename: a.filename })),
    ],
  }

  return new Promise((resolve, reject) => {
    new MailComposer(mail).compile().build((err, message) => {
      if (err) reject(err)
      else resolve(message)
    })
  })
}

// Boundaries, Date and Message-ID are regenerated on every build, so tests
// compare against a normalized form rather than the raw bytes.
export function normalizeMimeForSnapshot(buffer) {
  return buffer
    .toString('utf8')
    .replace(/\r\n/g, '\n')
    .replace(/--_NmP-[0-9a-f]+-Part_(\d+)/g, '--_BOUNDARY_-Part_$1')
    .replace(/boundary="[^"]*"/g, 'boundary="BOUNDARY"')
    .replace(/^Message-ID: <[^>]*>$/gm, 'Message-ID: <MESSAGE_ID>')
    .replace(/^Date: .*$/gm, 'Date: DATE')
    .replace(/^Content-ID: <([^>]*)>$/gm, 'Content-ID: <$1>')
}
