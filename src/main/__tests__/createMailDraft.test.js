import { describe, it, expect } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { draftScript, friendlyJxaError, TABS_TO_BODY } from '../jxa/createMailDraft.js'

const run = promisify(execFile)
const isMac = process.platform === 'darwin'

describe('draftScript', () => {
  it('compiles and runs its guard without touching Mail', async () => {
    if (!isMac) return
    // 'check' returns before any Application() call, so this proves the script
    // is syntactically valid JXA without needing Automation permission.
    const { stdout } = await run('osascript', ['-l', 'JavaScript', '-e', draftScript(), 'check'])
    expect(stdout.trim()).toBe('ok')
  })

  it('drives Mail through an OutgoingMessage and a paste', () => {
    const s = draftScript()
    expect(s).toContain("Application('Mail')")
    expect(s).toContain('OutgoingMessage')
    expect(s).toContain('ToRecipient')
    expect(s).toContain('Mail.activate()')
    // The body is filled by pasting the styled clipboard, which is what keeps
    // the formatting without building any MIME.
    expect(s).toContain("keystroke('v', { using: ['command down'] })")
    expect(s).toContain("Application('System Events')")
  })

  it('tabs from the To field to the body a tunable number of times', () => {
    // To → Cc → Subject → Body in a default Mail compose window.
    expect(TABS_TO_BODY).toBe(3)
    expect(draftScript()).toContain('payload.tabsToBody')
  })

  it('takes its payload as an argument rather than interpolating it', async () => {
    if (!isMac) return
    // Nothing user-supplied is concatenated into the script text, so a subject
    // containing quotes or newlines cannot break out of it.
    expect(draftScript()).not.toContain('${')
    const { stdout } = await run('osascript', [
      '-l', 'JavaScript', '-e', draftScript(),
      'check', JSON.stringify({ subject: `"); Application('Mail').quit(); //` }),
    ])
    expect(stdout.trim()).toBe('ok')
  })
})

describe('friendlyJxaError', () => {
  it('turns the -1743 automation refusal into instructions', () => {
    const msg = friendlyJxaError('execution error: Not authorized to send Apple events to Mail. (-1743)')
    expect(msg).toMatch(/Privacy & Security/)
    expect(msg).toMatch(/Automation/)
    expect(msg).toMatch(/Accessibility/)
    // And points at the path that needs no permissions at all.
    expect(msg).toMatch(/IMAP/)
  })

  it('explains a missing Mail.app', () => {
    expect(friendlyJxaError("execution error: Can't get application \"Mail\". (-1728)"))
      .toMatch(/Mail\.app is installed/)
  })

  it('never returns an empty message', () => {
    expect(friendlyJxaError('')).toBeTruthy()
    expect(friendlyJxaError(null)).toBeTruthy()
  })
})
