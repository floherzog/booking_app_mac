import { describe, it, expect } from 'vitest'
import { renderEmailHtml, htmlToText } from '@core/emailHtml'

function doc(...content) {
  return { type: 'doc', content }
}
function para(...content) {
  return { type: 'paragraph', content }
}
function text(t, marks) {
  return marks ? { type: 'text', marks, text: t } : { type: 'text', text: t }
}

describe('renderEmailHtml', () => {
  it('produces an inline-styled document with no external stylesheet', () => {
    const { html } = renderEmailHtml(doc(para(text('Hallo'))))
    expect(html).toMatch(/^<!doctype html><html><body style="/)
    expect(html).toContain('<p style="margin:0 0 12px 0">Hallo</p>')
    expect(html).not.toContain('<style')
    expect(html).not.toContain('class=')
  })

  it('keeps bold, italic and underline as tags', () => {
    const { html } = renderEmailHtml(doc(para(
      text('b', [{ type: 'bold' }]),
      text('i', [{ type: 'italic' }]),
      text('u', [{ type: 'underline' }]),
    )))
    expect(html).toContain('<strong>b</strong>')
    expect(html).toContain('<em>i</em>')
    expect(html).toContain('<u>u</u>')
  })

  it('styles links inline while keeping the href', () => {
    const { html } = renderEmailHtml(doc(para(
      text('site', [{ type: 'link', attrs: { href: 'https://example.com' } }]),
    )))
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('color:#4f46e5')
  })

  it('rewrites booking-asset images to cid references and reports them', () => {
    const { html, cids } = renderEmailHtml(doc(
      { type: 'image', attrs: { src: 'booking-asset://abc123.png', alt: 'Press photo' } },
    ))
    expect(html).toContain('src="cid:asset-abc123.png"')
    expect(html).not.toContain('booking-asset://')
    expect(html).toContain('max-width:100%')
    expect(cids).toEqual([{ cid: 'asset-abc123.png', assetId: 'abc123.png' }])
  })

  it('lists each asset once even when used twice', () => {
    const { cids } = renderEmailHtml(doc(
      { type: 'image', attrs: { src: 'booking-asset://a.png' } },
      { type: 'image', attrs: { src: 'booking-asset://a.png' } },
      { type: 'image', attrs: { src: 'booking-asset://b.png' } },
    ))
    expect(cids.map(c => c.assetId)).toEqual(['a.png', 'b.png'])
  })

  it('leaves an ordinary remote image alone', () => {
    const { html, cids } = renderEmailHtml(doc(
      { type: 'image', attrs: { src: 'https://example.com/x.png' } },
    ))
    expect(html).toContain('src="https://example.com/x.png"')
    expect(cids).toEqual([])
  })

  it('renders a videoLink as a linked thumbnail plus a watch line', () => {
    const { html, cids } = renderEmailHtml(doc(
      { type: 'videoLink', attrs: { url: 'https://vimeo.com/12345', thumbAssetId: 'thumb.jpg', label: '▶ Watch video' } },
    ))
    expect(html).toContain('href="https://vimeo.com/12345"')
    expect(html).toContain('src="cid:asset-thumb.jpg"')
    expect(html).toContain('▶ Watch video')
    // The thumbnail travels as an inline attachment like any other image.
    expect(cids).toEqual([{ cid: 'asset-thumb.jpg', assetId: 'thumb.jpg' }])
  })

  it('renders a videoLink without a thumbnail as a plain link', () => {
    const { html, cids } = renderEmailHtml(doc(
      { type: 'videoLink', attrs: { url: 'https://vimeo.com/12345', thumbAssetId: '' } },
    ))
    expect(html).toContain('href="https://vimeo.com/12345"')
    expect(html).not.toContain('<img')
    expect(cids).toEqual([])
  })

  it('handles an empty document', () => {
    const { html, cids } = renderEmailHtml(null)
    expect(html).toContain('<body style=')
    expect(cids).toEqual([])
  })

  it('snapshot: a full template body', () => {
    const { html, cids } = renderEmailHtml(doc(
      para(text('Hallo '), text('Anna', [{ type: 'bold' }]), text('!')),
      para(text('Mehr auf '), text('unserer Seite', [{ type: 'link', attrs: { href: 'https://band.de' } }])),
      { type: 'image', attrs: { src: 'booking-asset://press.jpg', alt: 'Press' } },
      { type: 'videoLink', attrs: { url: 'https://youtu.be/abc', thumbAssetId: 'still.png', label: '▶ Watch video' } },
    ))
    expect(html).toMatchSnapshot()
    expect(cids).toMatchSnapshot()
  })
})

describe('htmlToText', () => {
  it('turns block tags into line breaks and drops the rest', () => {
    const { html } = renderEmailHtml(doc(para(text('Erste Zeile')), para(text('Zweite Zeile'))))
    expect(htmlToText(html)).toBe('Erste Zeile\n\nZweite Zeile')
  })

  it('decodes the entities generateHTML emits', () => {
    const { html } = renderEmailHtml(doc(para(text('Rock & Roll <live>'))))
    expect(htmlToText(html)).toBe('Rock & Roll <live>')
  })
})
