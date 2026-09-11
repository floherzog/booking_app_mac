import { describe, it, expect } from 'vitest'
import { computeDuplicates, pairKey, dismissPair, isSimilar } from '../duplicates.js'

const row = (idx, Venue, City) => ({ _idx: idx, Venue, City })

describe('isSimilar', () => {
  it('matches identical names', () => {
    expect(isSimilar('Jazzclub', 'Jazzclub')).toBe(true)
  })

  it('matches when one name contains the other', () => {
    expect(isSimilar('Jazz Gütersloh', 'Jazz in Gütersloh')).toBe(true)
  })

  it('ignores punctuation', () => {
    expect(isSimilar('Jazz in Gütersloh?', 'Jazz Gütersloh')).toBe(true)
  })

  it('matches across spacing', () => {
    expect(isSimilar('Kulturzentrum', 'Kultur Zentrum')).toBe(true)
  })

  it('rejects unrelated names', () => {
    expect(isSimilar('Berghain', 'Kulturfabrik')).toBe(false)
  })

  it('rejects an empty name', () => {
    expect(isSimilar('', 'Berghain')).toBe(false)
  })
})

describe('computeDuplicates', () => {
  it('flags both rows of a duplicate pair and links them as partners', () => {
    const rows = [row(0, 'Jazzclub', 'Berlin'), row(1, 'Jazz Club', 'Berlin')]
    const { dups, partners } = computeDuplicates(rows)
    expect([...dups].sort()).toEqual([0, 1])
    expect(partners[0].map(r => r._idx)).toEqual([1])
    expect(partners[1].map(r => r._idx)).toEqual([0])
  })

  it('never compares venues in different cities', () => {
    const rows = [row(0, 'Jazzclub', 'Berlin'), row(1, 'Jazzclub', 'Hamburg')]
    expect(computeDuplicates(rows).dups.size).toBe(0)
  })

  it('skips rows with no city', () => {
    const rows = [row(0, 'Jazzclub', ''), row(1, 'Jazzclub', '')]
    expect(computeDuplicates(rows).dups.size).toBe(0)
  })

  it('skips rows with no venue name', () => {
    const rows = [row(0, '', 'Berlin'), row(1, '', 'Berlin')]
    expect(computeDuplicates(rows).dups.size).toBe(0)
  })

  it('honours a dismissed pair', () => {
    const rows = [row(0, 'Jazzclub', 'Berlin'), row(1, 'Jazz Club', 'Berlin')]
    const dismissed = dismissPair(new Set(), rows[0], rows[1])
    expect(computeDuplicates(rows, dismissed).dups.size).toBe(0)
  })

  it('honours a dismissed pair whose fields carry odd whitespace', () => {
    // The dismissal key is built from the raw fields, while bucketing collapses
    // whitespace — these must still line up or dismissal silently stops working.
    const rows = [row(0, 'Jazz  Club', 'Berlin'), row(1, 'Jazz Club', 'Berlin')]
    const dismissed = dismissPair(new Set(), rows[0], rows[1])
    expect(computeDuplicates(rows, dismissed).dups.size).toBe(0)
  })

  it('links a venue duplicated three times to both of its partners', () => {
    const rows = [row(0, 'Jazzclub', 'Berlin'), row(1, 'Jazz Club', 'Berlin'), row(2, 'Jazzclub!', 'Berlin')]
    const { dups, partners } = computeDuplicates(rows)
    expect([...dups].sort()).toEqual([0, 1, 2])
    expect(partners[0].map(r => r._idx).sort()).toEqual([1, 2])
  })

  it('pairKey is order-independent', () => {
    const a = row(0, 'Jazzclub', 'Berlin')
    const b = row(1, 'Jazz Club', 'Berlin')
    expect(pairKey(a, b)).toBe(pairKey(b, a))
  })
})
