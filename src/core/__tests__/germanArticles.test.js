import { describe, it, expect } from 'vitest'
import {
  articleFor, prepositionCase, contract, hasMotionCue,
  applyGermanArticles, hasArticlePlaceholder,
} from '../germanArticles.js'

describe('articleFor', () => {
  it('covers the four genders in the nominative', () => {
    expect(articleFor('m')).toBe('der')
    expect(articleFor('f')).toBe('die')
    expect(articleFor('n')).toBe('das')
    expect(articleFor('pl')).toBe('die')
  })
  it('declines correctly', () => {
    expect(articleFor('m', 'dat')).toBe('dem')
    expect(articleFor('f', 'dat')).toBe('der')
    expect(articleFor('n', 'gen')).toBe('des')
    expect(articleFor('pl', 'dat')).toBe('den')
  })
  it('falls back to neuter nominative for nonsense', () => {
    expect(articleFor('x', 'zzz')).toBe('das')
  })
})

describe('prepositionCase', () => {
  it('knows the dative-only prepositions', () => {
    expect(prepositionCase('mit')).toBe('dat')
    expect(prepositionCase('bei')).toBe('dat')
    expect(prepositionCase('nach')).toBe('dat')
  })
  it('knows the accusative-only prepositions', () => {
    expect(prepositionCase('für')).toBe('acc')
    expect(prepositionCase('ohne')).toBe('acc')
  })
  it('knows the genitive prepositions', () => {
    expect(prepositionCase('wegen')).toBe('gen')
    expect(prepositionCase('während')).toBe('gen')
  })
  it('defaults a two-way preposition to the dative', () => {
    expect(prepositionCase('in')).toBe('dat')
    expect(prepositionCase('auf')).toBe('dat')
  })
  it('flips a two-way preposition to the accusative for motion', () => {
    expect(prepositionCase('in', { motion: true })).toBe('acc')
  })
  it('returns null for an ordinary word', () => {
    expect(prepositionCase('Konzert')).toBe(null)
    expect(prepositionCase('')).toBe(null)
  })
})

describe('contract', () => {
  it('produces the obligatory contractions', () => {
    expect(contract('in', 'dem')).toBe('im')
    expect(contract('in', 'das')).toBe('ins')
    expect(contract('an', 'dem')).toBe('am')
    expect(contract('bei', 'dem')).toBe('beim')
    expect(contract('von', 'dem')).toBe('vom')
    expect(contract('zu', 'dem')).toBe('zum')
    expect(contract('zu', 'der')).toBe('zur')
  })
  it('leaves non-contracting pairs alone', () => {
    expect(contract('in', 'der')).toBe(null)
    expect(contract('für', 'die')).toBe(null)
    expect(contract('mit', 'dem')).toBe(null) // "mit dem" does not contract in writing
  })
})

describe('hasMotionCue', () => {
  it('spots a verb of motion just before', () => {
    expect(hasMotionCue('wir kommen gerne')).toBe(true)
    expect(hasMotionCue('wir würden gerne fahren')).toBe(true)
  })
  it('ignores a stationary verb', () => {
    expect(hasMotionCue('wir spielen gerne')).toBe(false)
  })
  it('does not look back further than the window', () => {
    expect(hasMotionCue('kommen a b c d e f g h', 3)).toBe(false)
  })
})

describe('applyGermanArticles', () => {
  it('contracts in + dem for a neuter venue', () => {
    expect(applyGermanArticles('Wir spielen in {{article}} Kulturzentrum', 'n'))
      .toBe('Wir spielen im Kulturzentrum')
  })

  it('keeps in + der for a feminine venue', () => {
    expect(applyGermanArticles('Wir spielen in {{article}} Fabrik', 'f'))
      .toBe('Wir spielen in der Fabrik')
  })

  it('uses the accusative after für', () => {
    expect(applyGermanArticles('ein Konzert für {{article}} Hof', 'm'))
      .toBe('ein Konzert für den Hof')
  })

  it('uses the genitive after wegen', () => {
    expect(applyGermanArticles('wegen {{article}} Fabrik', 'f'))
      .toBe('wegen der Fabrik')
  })

  it('uses the nominative with no preposition in front', () => {
    expect(applyGermanArticles('{{article}} Fabrik ist toll', 'f')).toBe('die Fabrik ist toll')
  })

  it('does not treat an ordinary preceding word as a preposition', () => {
    expect(applyGermanArticles('unser Konzert {{article}} Fabrik', 'f'))
      .toBe('unser Konzert die Fabrik')
  })

  it('flips to the accusative and contracts when the sentence moves', () => {
    expect(applyGermanArticles('Wir kommen gerne in {{article}} Kulturzentrum', 'n'))
      .toBe('Wir kommen gerne ins Kulturzentrum')
  })

  it('keeps a capitalised preposition capitalised through a contraction', () => {
    expect(applyGermanArticles('In {{article}} Kulturzentrum spielen wir gern', 'n'))
      .toBe('Im Kulturzentrum spielen wir gern')
  })

  it('handles several placeholders in one text', () => {
    expect(applyGermanArticles('in {{article}} Fabrik und für {{article}} Fabrik', 'f'))
      .toBe('in der Fabrik und für die Fabrik')
  })

  it('tolerates whitespace inside the braces', () => {
    expect(applyGermanArticles('in {{ article }} Fabrik', 'f')).toBe('in der Fabrik')
  })

  it('leaves the text untouched with no gender', () => {
    expect(applyGermanArticles('in {{article}} Fabrik', null)).toBe('in {{article}} Fabrik')
  })

  it('leaves text with no placeholder alone', () => {
    expect(applyGermanArticles('nichts zu tun', 'f')).toBe('nichts zu tun')
  })
})

describe('hasArticlePlaceholder', () => {
  it('detects the placeholder', () => {
    expect(hasArticlePlaceholder('x {{article}} y')).toBe(true)
    expect(hasArticlePlaceholder('x {{ Article }} y')).toBe(true)
    expect(hasArticlePlaceholder('x {{venue}} y')).toBe(false)
  })
})
