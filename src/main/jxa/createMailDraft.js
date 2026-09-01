// The zero-config fallback: put the styled message on the clipboard, ask Mail to
// open a compose window, then paste. It needs no server settings at all, but it
// depends on window focus and on two macOS permissions, so it is offered for a
// single draft only — never for a bulk run.

// Mail's compose window focuses the To field; Tab moves To → Cc → Subject → Body
// in a default setup. Kept as a constant because a different Mail layout (or a
// visible Bcc field) shifts it.
export const TABS_TO_BODY = 3

// osascript -l JavaScript. `check` compiles and exits before touching Mail, so
// the syntax can be verified without automation permissions.
export function draftScript() {
  return `
function run(argv) {
  if (argv[0] === 'check') { return 'ok' }

  var payload = JSON.parse(argv[0])
  var Mail = Application('Mail')
  Mail.includeStandardAdditions = true

  var msg = Mail.OutgoingMessage({ subject: payload.subject, visible: true })
  Mail.outgoingMessages.push(msg)
  msg.toRecipients.push(Mail.ToRecipient({ address: payload.to }))

  Mail.activate()
  delay(payload.openDelay)

  var SystemEvents = Application('System Events')
  var proc = SystemEvents.processes['Mail']
  for (var i = 0; i < payload.tabsToBody; i++) {
    SystemEvents.keystroke(String.fromCharCode(9)) // Tab
    delay(0.15)
  }

  // Paste the styled clipboard contents into the body.
  SystemEvents.keystroke('v', { using: ['command down'] })
  delay(payload.pasteDelay)

  return 'ok'
}
`.trim()
}

// osascript exit codes / messages we can explain rather than dump.
export function friendlyJxaError(stderr) {
  const msg = String(stderr || '')
  if (/-1743|not authorized|not allowed assistive/i.test(msg)) {
    return [
      'macOS blocked this app from controlling Mail.',
      'Open System Settings → Privacy & Security → Automation and enable Mail (and System Events) for Booking,',
      'then Privacy & Security → Accessibility and add Booking there too. Quit and reopen Booking afterwards.',
      'The IMAP path needs none of these permissions — configure Settings → Mail to avoid this entirely.',
    ].join(' ')
  }
  if (/-1728|Can.t get application/i.test(msg)) {
    return 'Could not reach Mail. Make sure Mail.app is installed and has been opened at least once.'
  }
  if (/execution error/i.test(msg)) return `Mail reported an error: ${msg.trim()}`
  return msg.trim() || 'The AppleScript draft could not be created.'
}
