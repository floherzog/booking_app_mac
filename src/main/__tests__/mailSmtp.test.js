import { describe, it, expect, vi } from 'vitest'

// Both modules register IPC handlers on import, so electron has to be stubbed.
vi.mock('electron', () => ({ ipcMain: { handle: () => {} }, app: { getPath: () => '/tmp' } }))
vi.mock('imapflow', () => ({ ImapFlow: class {} }))
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({}) } }))
vi.mock('../secrets.js', () => ({ getSecret: key => (key === 'imapPassword' ? 'app-specific' : null) }))

const { defaultSmtpHost, smtpConfig, sendMailWith } = await import('../ipc/mailSmtp.js')

const settings = {
  mail: { host: 'imap.mail.me.com', user: 'me@icloud.com', fromName: 'Me', fromAddress: 'me@icloud.com' },
}

describe('defaultSmtpHost', () => {
  it('derives iCloud and generic imap. hosts', () => {
    expect(defaultSmtpHost('imap.mail.me.com')).toBe('smtp.mail.me.com')
    expect(defaultSmtpHost('imap.example.org')).toBe('smtp.example.org')
    expect(defaultSmtpHost('')).toBe('')
  })
})

describe('smtpConfig', () => {
  it('falls back to the derived host and STARTTLS on 587', () => {
    const cfg = smtpConfig(settings)
    expect(cfg).toMatchObject({ host: 'smtp.mail.me.com', port: 587, secure: false, requireTLS: true })
    expect(cfg.auth).toEqual({ user: 'me@icloud.com', pass: 'app-specific' })
  })

  it('uses implicit TLS on 465', () => {
    const cfg = smtpConfig({ mail: { ...settings.mail, smtpPort: 465 } })
    expect(cfg).toMatchObject({ port: 465, secure: true, requireTLS: false })
  })

  it('refuses to guess a username', () => {
    expect(() => smtpConfig({ mail: { host: 'imap.mail.me.com' } })).toThrow(/username/i)
  })
})

describe('sendMailWith', () => {
  function fakeTransport() {
    const calls = []
    return {
      calls,
      sendMail: async msg => { calls.push(msg); return { accepted: [msg.envelope.to], messageId: '<id>' } },
    }
  }

  it('sends the same MIME bytes the draft path builds, with an explicit envelope', async () => {
    const transport = fakeTransport()
    const filed = []
    const res = await sendMailWith(
      transport, settings,
      { to: 'venue@example.com', subject: 'Hallo', html: '<p>Hi</p>' },
      { resolveAsset: () => null, fileToSent: async mime => { filed.push(mime); return { mailbox: 'Sent Messages' } } },
    )

    expect(transport.calls).toHaveLength(1)
    const sent = transport.calls[0]
    expect(sent.envelope).toEqual({ from: 'me@icloud.com', to: 'venue@example.com' })
    const raw = sent.raw.toString('utf8')
    expect(raw).toContain('To: venue@example.com')
    expect(raw).toContain('Subject: Hallo')
    expect(res.sentMailbox).toBe('Sent Messages')
    expect(filed[0]).toBe(sent.raw)
  })

  it('still reports success when filing the copy in Sent fails', async () => {
    const transport = fakeTransport()
    const res = await sendMailWith(
      transport, settings,
      { to: 'venue@example.com', subject: 'x', html: '<p>x</p>' },
      { resolveAsset: () => null, fileToSent: async () => { throw new Error('no Sent mailbox') } },
    )
    expect(res.accepted).toEqual(['venue@example.com'])
    expect(res.sentMailbox).toBeNull()
  })

  it('refuses a message with no recipient', async () => {
    await expect(sendMailWith(fakeTransport(), settings, { subject: 'x' }, { fileToSent: async () => ({}) }))
      .rejects.toThrow(/recipient/i)
  })
})
