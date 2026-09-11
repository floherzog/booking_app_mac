import { describe, it, expect, vi } from 'vitest'

// The module registers an IPC handler on import, so electron has to be stubbed.
vi.mock('electron', () => ({ ipcMain: { handle: () => {} }, app: { getPath: () => '/tmp' } }))
vi.mock('imapflow', () => ({ ImapFlow: class {} }))
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({}) } }))
vi.mock('../secrets.js', () => ({ getSecret: () => 'app-specific' }))

const { isAutoReply } = await import('../ipc/mailSync.js')

describe('isAutoReply', () => {
  it('trusts an Auto-Submitted header', () => {
    expect(isAutoReply({ headers: 'Auto-Submitted: auto-replied\r\n' })).toBe(true)
    expect(isAutoReply({ headers: 'Auto-Submitted: auto-generated; owner\r\n' })).toBe(true)
  })

  it('treats "Auto-Submitted: no" as a human message', () => {
    expect(isAutoReply({ headers: 'Auto-Submitted: no\r\n', subject: 'Re: booking' })).toBe(false)
  })

  it('recognises X-Autoreply and X-Autorespond', () => {
    expect(isAutoReply({ headers: 'X-Autoreply: yes\r\n' })).toBe(true)
    expect(isAutoReply({ headers: 'X-Autorespond: vacation\r\n' })).toBe(true)
  })

  it('recognises a bulk/auto Precedence', () => {
    expect(isAutoReply({ headers: 'Precedence: auto_reply\r\n' })).toBe(true)
    expect(isAutoReply({ headers: 'Precedence: bulk\r\n' })).toBe(true)
  })

  it('falls back to the subject in English and German', () => {
    expect(isAutoReply({ subject: 'Out of Office: back on Monday' })).toBe(true)
    expect(isAutoReply({ subject: 'Automatische Antwort: Urlaub' })).toBe(true)
    expect(isAutoReply({ subject: 'Abwesenheitsnotiz' })).toBe(true)
    expect(isAutoReply({ subject: 'Re: Automatic reply' })).toBe(true)
  })

  it('leaves an ordinary reply alone', () => {
    expect(isAutoReply({ headers: 'From: a@b.com\r\n', subject: 'Re: Booking request' })).toBe(false)
    expect(isAutoReply({})).toBe(false)
  })

  it('is not fooled by the words appearing mid-subject', () => {
    expect(isAutoReply({ subject: 'We loved your automatic reply demo' })).toBe(false)
  })
})
