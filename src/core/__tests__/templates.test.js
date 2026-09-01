import { describe, it, expect } from 'vitest'
import {
  PLACEHOLDERS, languageForRow, resolveTemplate, substitutePlaceholders,
  substituteDoc, substituteTemplate,
} from '@core/templates'

const LANGUAGES = {
  default: 'en',
  map: {
    Germany: 'de', Deutschland: 'de',
    Austria: 'de', 'Österreich': 'de',
    Switzerland: 'de', Schweiz: 'de',
  },
}

const de = { id: 'de1', band: 'The Band', language: 'de', subject: 'Anfrage {{venue}}' }
const en = { id: 'en1', band: 'The Band', language: 'en', subject: 'Booking {{venue}}' }
const other = { id: 'x', band: 'Other Band', language: 'de', subject: '' }

describe('languageForRow', () => {
  it('maps the DACH countries to German', () => {
    for (const c of ['Germany', 'Deutschland', 'Austria', 'Österreich', 'Switzerland', 'Schweiz']) {
      expect(languageForRow({ Country: c }, LANGUAGES)).toBe('de')
    }
  })

  it('matches the country case- and whitespace-insensitively', () => {
    expect(languageForRow({ Country: '  gErMaNy ' }, LANGUAGES)).toBe('de')
  })

  it('falls back to the default for an unknown or missing country', () => {
    expect(languageForRow({ Country: 'Iceland' }, LANGUAGES)).toBe('en')
    expect(languageForRow({ Country: '' }, LANGUAGES)).toBe('en')
    expect(languageForRow({}, LANGUAGES)).toBe('en')
  })

  it('honours a different default', () => {
    expect(languageForRow({ Country: 'Iceland' }, { ...LANGUAGES, default: 'fr' })).toBe('fr')
  })
})

describe('resolveTemplate', () => {
  const row = c => ({ Band: 'The Band', Country: c })

  it('picks the exact band + language match', () => {
    const r = resolveTemplate([en, de], row('Germany'), LANGUAGES)
    expect(r.template).toBe(de)
    expect(r.language).toBe('de')
    expect(r.fallbackUsed).toBe(false)
  })

  it('falls back to the default language and says so', () => {
    const r = resolveTemplate([en], row('Germany'), LANGUAGES)
    expect(r.template).toBe(en)
    expect(r.language).toBe('en')
    expect(r.fallbackUsed).toBe(true)
    expect(r.reason).toMatch(/no "de" template/i)
  })

  it('returns nothing when neither language exists for the band', () => {
    const r = resolveTemplate([de], { Band: 'The Band', Country: 'France' }, LANGUAGES)
    expect(r.template).toBeNull()
    expect(r.reason).toMatch(/no "en" or "en"|no "en"/i)
  })

  it('returns nothing for a band with no templates at all', () => {
    const r = resolveTemplate([other], row('Germany'), LANGUAGES)
    expect(r.template).toBeNull()
    expect(r.reason).toMatch(/no templates for "The Band"/i)
  })

  it('returns nothing when the venue has no band', () => {
    const r = resolveTemplate([en, de], { Country: 'Germany' }, LANGUAGES)
    expect(r.template).toBeNull()
    expect(r.reason).toMatch(/no band/i)
  })

  it('an unknown country still resolves via the default language', () => {
    const r = resolveTemplate([en, de], row('Iceland'), LANGUAGES)
    expect(r.template).toBe(en)
    expect(r.fallbackUsed).toBe(false)
  })
})

describe('substitutePlaceholders', () => {
  const row = { Venue: 'Club X', Contact: 'Anna', City: 'Berlin', Country: 'Germany', Band: 'The Band', Dates: 'Jun 2026', Text: '' }

  it('replaces every supported placeholder', () => {
    const { text } = substitutePlaceholders('{{venue}} / {{contact}} / {{city}} / {{country}} / {{band}} / {{dates}}', row)
    expect(text).toBe('Club X / Anna / Berlin / Germany / The Band / Jun 2026')
  })

  it('covers exactly the documented placeholder list', () => {
    expect(PLACEHOLDERS).toEqual(['venue', 'contact', 'city', 'country', 'dates', 'text', 'band'])
    for (const p of PLACEHOLDERS) {
      expect(substitutePlaceholders(`{{${p}}}`, row).text).not.toContain('{{')
    }
  })

  it('replaces a missing field with nothing and reports it', () => {
    const { text, empties } = substitutePlaceholders('Hi {{contact}}{{text}}!', { Venue: 'V' })
    expect(text).toBe('Hi !')
    expect(empties.sort()).toEqual(['contact', 'text'])
  })

  it('reports a blank (whitespace-only) field as empty', () => {
    expect(substitutePlaceholders('{{contact}}', { Contact: '   ' }).empties).toEqual(['contact'])
  })

  it('tolerates whitespace and case inside the braces', () => {
    expect(substitutePlaceholders('{{ Venue }}', row).text).toBe('Club X')
  })

  it('leaves an unknown placeholder untouched', () => {
    const { text, empties } = substitutePlaceholders('{{nope}}', row)
    expect(text).toBe('{{nope}}')
    expect(empties).toEqual([])
  })
})

describe('substituteDoc', () => {
  const row = { Venue: 'Club X', Contact: 'Anna', Band: 'The Band' }

  it('substitutes inside text nodes, marks intact', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hallo ' },
          { type: 'text', marks: [{ type: 'bold' }], text: '{{contact}}' },
          { type: 'text', text: ' vom {{venue}}' },
        ],
      }],
    }
    const { doc: out } = substituteDoc(doc, row)
    const texts = out.content[0].content.map(n => n.text)
    expect(texts).toEqual(['Hallo ', 'Anna', ' vom Club X'])
    expect(out.content[0].content[1].marks[0].type).toBe('bold')
  })

  it('substitutes inside attributes such as a link href', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', marks: [{ type: 'link', attrs: { href: 'https://x.de/{{city}}' } }], text: 'link' }],
      }],
    }
    const { doc: out, empties } = substituteDoc(doc, { City: 'Berlin' })
    expect(out.content[0].content[0].marks[0].attrs.href).toBe('https://x.de/Berlin')
    expect(empties).toEqual([])
  })

  it('collects empties from anywhere in the tree', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '{{contact}}' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '{{dates}}' }] },
      ],
    }
    expect(substituteDoc(doc, { Venue: 'V' }).empties.sort()).toEqual(['contact', 'dates'])
  })

  it('does not mutate the stored template document', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '{{venue}}' }] }] }
    substituteDoc(doc, row)
    expect(doc.content[0].content[0].text).toBe('{{venue}}')
  })
})

describe('substituteTemplate', () => {
  it('does subject and body together and merges the empties', () => {
    const template = {
      subject: 'Anfrage {{venue}} ({{dates}})',
      bodyJSON: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hallo {{contact}}' }] }] },
    }
    const out = substituteTemplate(template, { Venue: 'Club X' })
    expect(out.subject).toBe('Anfrage Club X ()')
    expect(out.bodyJSON.content[0].content[0].text).toBe('Hallo ')
    expect(out.empties.sort()).toEqual(['contact', 'dates'])
  })
})
