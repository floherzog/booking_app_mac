import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildDraftMime, normalizeMimeForSnapshot } from '../mime.js'

// A real 1x1 PNG, so the encoder has actual bytes to base64.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

let dir
let assetFile

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'booking-mime-'))
  assetFile = join(dir, 'press.png')
  writeFileSync(assetFile, PNG)
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

const BASE = {
  from: { name: 'Flo', address: 'flo@example.com' },
  to: 'venue@example.com',
  subject: 'Booking-Anfrage Club X',
  html: '<!doctype html><html><body style="color:#111827"><p style="margin:0 0 12px 0">Hallo <strong>Anna</strong></p></body></html>',
  text: 'Hallo Anna',
}

describe('buildDraftMime', () => {
  it('produces a complete RFC822 message', async () => {
    const mime = await buildDraftMime(BASE)
    expect(Buffer.isBuffer(mime)).toBe(true)
    const s = mime.toString('utf8')
    expect(s).toContain('From: Flo <flo@example.com>')
    expect(s).toContain('To: venue@example.com')
    expect(s).toContain('MIME-Version: 1.0')
    // Headers and body are separated by a blank line, CRLF as the wire format.
    expect(s).toContain('\r\n\r\n')
  })

  it('encodes a non-ASCII subject rather than mangling it', async () => {
    const mime = await buildDraftMime({ ...BASE, subject: 'Anfrage für Köln — Grüße' })
    const s = mime.toString('utf8')
    expect(s).toMatch(/Subject: =\?UTF-8\?/)
    expect(s).not.toContain('Anfrage f?r')
  })

  it('keeps umlauts recoverable in the body', async () => {
    const mime = await buildDraftMime({ ...BASE, html: '<p>Grüße aus Köln</p>', text: 'Grüße aus Köln' })
    const s = mime.toString('utf8')
    expect(s).toMatch(/charset=utf-8/i)
    // quoted-printable or base64, but never a literal '?' substitution
    expect(s).not.toContain('Gr??e')
  })

  it('carries both a text and an html alternative', async () => {
    const s = (await buildDraftMime(BASE)).toString('utf8')
    expect(s).toContain('multipart/alternative')
    expect(s).toContain('Content-Type: text/plain')
    expect(s).toContain('Content-Type: text/html')
  })

  it('embeds an inline asset with its Content-ID and inline disposition', async () => {
    const mime = await buildDraftMime({
      ...BASE,
      html: '<p>See <img src="cid:asset-press.png"></p>',
      inlineAssets: [{ path: assetFile, cid: 'asset-press.png' }],
    })
    const s = mime.toString('utf8')
    expect(s).toContain('multipart/related')
    expect(s).toContain('Content-ID: <asset-press.png>')
    expect(s).toMatch(/Content-Disposition: inline/)
    expect(s).toContain('Content-Type: image/png')
    // The html still references it by cid, which is what makes it render in place.
    expect(s).toContain('cid:asset-press.png')
    // And the actual bytes travelled base64-encoded.
    expect(s).toContain(PNG.toString('base64').slice(0, 24))
  })

  it('wires several cids independently', async () => {
    const second = join(dir, 'still.png')
    writeFileSync(second, PNG)
    const s = (await buildDraftMime({
      ...BASE,
      inlineAssets: [
        { path: assetFile, cid: 'asset-press.png' },
        { path: second, cid: 'asset-still.png' },
      ],
    })).toString('utf8')
    expect(s).toContain('Content-ID: <asset-press.png>')
    expect(s).toContain('Content-ID: <asset-still.png>')
  })

  it('adds a regular attachment as an attachment, not inline', async () => {
    const s = (await buildDraftMime({
      ...BASE,
      attachments: [{ path: assetFile, filename: 'rider.png' }],
    })).toString('utf8')
    expect(s).toMatch(/Content-Disposition: attachment; filename="?rider\.png/)
  })

  it('falls back to a bare address when no from name is set', async () => {
    const s = (await buildDraftMime({ ...BASE, from: { address: 'flo@example.com' } })).toString('utf8')
    expect(s).toContain('From: flo@example.com')
  })

  it('snapshot: a plain draft', async () => {
    const mime = await buildDraftMime(BASE)
    expect(normalizeMimeForSnapshot(mime)).toMatchSnapshot()
  })

  it('snapshot: a draft with an inline asset', async () => {
    const mime = await buildDraftMime({
      ...BASE,
      html: '<!doctype html><html><body><p>Foto:</p><img src="cid:asset-press.png"></body></html>',
      inlineAssets: [{ path: assetFile, cid: 'asset-press.png' }],
    })
    expect(normalizeMimeForSnapshot(mime)).toMatchSnapshot()
  })
})

describe('normalizeMimeForSnapshot', () => {
  it('makes two builds of the same message compare equal', async () => {
    const a = await buildDraftMime(BASE)
    const b = await buildDraftMime(BASE)
    expect(a.equals(b)).toBe(false) // boundaries/Message-ID differ every time
    expect(normalizeMimeForSnapshot(a)).toBe(normalizeMimeForSnapshot(b))
  })
})
