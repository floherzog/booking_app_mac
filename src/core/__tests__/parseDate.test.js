import { describe, it, expect } from 'vitest'
import { parseDate, formatDateDDMMYY, toInputValue, fromInputValue, parseMonthsFromTimeFrame } from '@core/parseDate'

function ymd(d) {
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()]
}

describe('parseDate', () => {
  it("reads the app's own dd.MM.yy format", () => {
    expect(ymd(parseDate('15.03.24'))).toEqual([2024, 3, 15])
  })

  it('reads a German month name', () => {
    expect(ymd(parseDate('Juni 2027'))).toEqual([2027, 6, 1])
  })

  it('reads an English month name', () => {
    expect(ymd(parseDate('March 2025'))).toEqual([2025, 3, 1])
  })

  it('reads a bare year', () => {
    expect(ymd(parseDate('2025'))).toEqual([2025, 1, 1])
  })

  it('reads ISO', () => {
    expect(ymd(parseDate('2025-03-15'))).toEqual([2025, 3, 15])
  })

  it('returns null for junk and empties', () => {
    expect(parseDate('')).toBeNull()
    expect(parseDate('   ')).toBeNull()
    expect(parseDate(null)).toBeNull()
    expect(parseDate('not a date')).toBeNull()
  })
})

describe('date formatting helpers', () => {
  it('formats back to dd.MM.yy', () => {
    expect(formatDateDDMMYY(new Date(2024, 2, 15))).toBe('15.03.24')
    expect(formatDateDDMMYY(null)).toBe('')
  })

  it('round-trips through the <input type=date> value', () => {
    expect(toInputValue('15.03.24')).toBe('2024-03-15')
    expect(fromInputValue('2024-03-15')).toBe('15.03.24')
    expect(fromInputValue('')).toBe('')
  })
})

describe('parseMonthsFromTimeFrame', () => {
  it('finds German and English month names as 0-based months', () => {
    expect(parseMonthsFromTimeFrame('Juni')).toEqual([5])
    expect(parseMonthsFromTimeFrame('June')).toEqual([5])
    expect(parseMonthsFromTimeFrame('August / September')).toEqual([7, 8])
  })

  it('de-duplicates a month named in both languages', () => {
    expect(parseMonthsFromTimeFrame('April (April)')).toEqual([3])
  })

  it('returns [] when nothing matches', () => {
    expect(parseMonthsFromTimeFrame('')).toEqual([])
    expect(parseMonthsFromTimeFrame('whenever')).toEqual([])
  })
})
