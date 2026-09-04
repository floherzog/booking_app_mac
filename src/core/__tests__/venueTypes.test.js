import { describe, it, expect } from 'vitest'
import { DEFAULT_VENUE_TYPES, normalizeVenueTypes, effectiveTypeOptions } from '@core/venueTypes'

describe('normalizeVenueTypes', () => {
  it('trims, drops empties and keeps the given order', () => {
    expect(normalizeVenueTypes([' club ', '', '  ', 'bar'])).toEqual(['club', 'bar'])
  })

  it('de-duplicates case-insensitively, keeping the first spelling', () => {
    expect(normalizeVenueTypes(['Club', 'club', 'CLUB'])).toEqual(['Club'])
  })

  it('tolerates objects and a missing list', () => {
    expect(normalizeVenueTypes([{ name: 'club' }])).toEqual(['club'])
    expect(normalizeVenueTypes(null)).toEqual([])
  })
})

describe('effectiveTypeOptions', () => {
  const rows = [{ Type: 'club' }, { Type: 'dead' }, { Type: '' }, {}]

  it('unions the managed list with what the rows already use', () => {
    expect(effectiveTypeOptions(rows, DEFAULT_VENUE_TYPES))
      .toEqual(['club', 'dead', 'festival', 'main'])
  })

  it('never loses a value a venue is already using', () => {
    // "club" is not managed, but a venue has it — it must stay selectable.
    expect(effectiveTypeOptions(rows, ['main'])).toContain('club')
  })

  it('does not duplicate a row value that differs only in case', () => {
    expect(effectiveTypeOptions([{ Type: 'Main' }], ['main'])).toEqual(['main'])
  })

  it('works with no rows and no managed list', () => {
    expect(effectiveTypeOptions([], [])).toEqual([])
    expect(effectiveTypeOptions(null, DEFAULT_VENUE_TYPES)).toEqual(['dead', 'festival', 'main'])
  })
})
