import { execFile } from 'node:child_process'
import { ipcMain, clipboard } from 'electron'
import { htmlToText } from '../../core/htmlText.js'
import { draftScript, friendlyJxaError, TABS_TO_BODY } from '../jxa/createMailDraft.js'

// Timings are generous on purpose: Mail's compose window can take a moment to
// appear, and pasting before it has focus silently drops the body.
const OPEN_DELAY_SECONDS = 1.2
const PASTE_DELAY_SECONDS = 0.4
const EXEC_TIMEOUT_MS = 30000

function osascript(args, { timeout = EXEC_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    execFile('osascript', args, { timeout }, (err, stdout, stderr) => {
      if (err) reject(new Error(friendlyJxaError(stderr || err.message)))
      else resolve(String(stdout).trim())
    })
  })
}

export function registerMailAppleScriptIpc() {
  // Single draft only — this drives the UI by keystroke, so a bulk run would be
  // both slow and fragile. Bulk goes through IMAP.
  ipcMain.handle('mail:appleScriptDraft', async (_e, { to, subject, html }) => {
    // Mail pastes whatever styled content is on the clipboard, which is how the
    // formatting survives without building any MIME.
    clipboard.write({ text: htmlToText(html), html })

    const payload = JSON.stringify({
      to: to || '',
      subject: subject || '',
      tabsToBody: TABS_TO_BODY,
      openDelay: OPEN_DELAY_SECONDS,
      pasteDelay: PASTE_DELAY_SECONDS,
    })

    await osascript(['-l', 'JavaScript', '-e', draftScript(), payload])
    return { ok: true }
  })

  // Compiles the script without letting it touch Mail — used by the tests and
  // handy for diagnosing a broken install.
  ipcMain.handle('mail:appleScriptCheck', async () => {
    const out = await osascript(['-l', 'JavaScript', '-e', draftScript(), 'check'], { timeout: 10000 })
    return { ok: out === 'ok' }
  })
}
