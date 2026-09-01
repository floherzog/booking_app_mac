import { describe, it, expect } from 'vitest'
import { DEFAULT_RULES, mergeRules, validateRules } from '@core/rules'

describe('DEFAULT_RULES', () => {
  it(`carries the webapp's hold keywords verbatim`, () => {
    // Copied byte-for-byte from the webapp's HOLD_KEYWORDS (35 entries — the
    // plan's "27" was an undercount). The length is asserted so a copy slip shows up.
    expect(DEFAULT_RULES.holdKeywords).toHaveLength(35)
    expect(DEFAULT_RULES.holdKeywords).toContain('anrufen')
    expect(DEFAULT_RULES.holdKeywords).toContain("don't email")
    expect(DEFAULT_RULES.holdKeywords).toContain('they will get back')
    expect(new Set(DEFAULT_RULES.holdKeywords).size).toBe(DEFAULT_RULES.holdKeywords.length)
  })

  it(`keeps the webapp's numeric defaults`, () => {
    expect(DEFAULT_RULES.holdOverrideDays).toBe(365)
    expect(DEFAULT_RULES.defaultFrequencyDays).toBe(30)
    expect(DEFAULT_RULES.recentlyPlayedDays).toBe(365)
    expect(DEFAULT_RULES.festivalPastMonths).toBe(2)
    expect(DEFAULT_RULES.festivalFutureMonths).toBe(3)
    expect(DEFAULT_RULES.batchSize).toBe(10)
    expect(DEFAULT_RULES.batchSortKeys).toEqual(['Country', 'City', 'Venue'])
  })
})

describe('mergeRules', () => {
  it('returns the defaults for junk input', () => {
    expect(mergeRules(null)).toEqual(DEFAULT_RULES)
    expect(mergeRules('nope')).toEqual(DEFAULT_RULES)
  })

  it('deep-merges dateColors without dropping the rest', () => {
    const merged = mergeRules({ dateColors: { lastPlayedRedDays: 90 } })
    expect(merged.dateColors.lastPlayedRedDays).toBe(90)
    expect(merged.dateColors.lastPlayedOrangeDays).toBe(365)
    expect(merged.batchSize).toBe(10)
  })

  it('drops unknown keys', () => {
    const merged = mergeRules({ batchSize: 4, somethingElse: true, dateColors: { nope: 1 } })
    expect(merged.batchSize).toBe(4)
    expect('somethingElse' in merged).toBe(false)
    expect('nope' in merged.dateColors).toBe(false)
  })

  it('lowercases and trims hold keywords', () => {
    expect(mergeRules({ holdKeywords: ['  Anrufen ', '', 'WAIT'] }).holdKeywords).toEqual(['anrufen', 'wait'])
  })

  it('does not mutate DEFAULT_RULES', () => {
    const merged = mergeRules({ batchSize: 99 })
    merged.dateColors.lastPlayedRedDays = 1
    expect(DEFAULT_RULES.batchSize).toBe(10)
    expect(DEFAULT_RULES.dateColors.lastPlayedRedDays).toBe(182)
  })
})

describe('validateRules', () => {
  it('accepts the defaults', () => {
    expect(validateRules(DEFAULT_RULES)).toEqual([])
  })

  it('rejects a zero batch size', () => {
    expect(validateRules({ ...DEFAULT_RULES, batchSize: 0 }).join(' ')).toMatch(/Batch size/)
  })

  it('rejects an unknown batch sort column', () => {
    expect(validateRules({ ...DEFAULT_RULES, batchSortKeys: ['Nope'] }).join(' ')).toMatch(/sort columns/)
  })

  it('rejects out-of-order color thresholds', () => {
    const bad = { ...DEFAULT_RULES, dateColors: { ...DEFAULT_RULES.dateColors, lastReplyGreenDays: 400 } }
    expect(validateRules(bad).join(' ')).toMatch(/Last-reply/)
  })

  it('rejects an empty hold keyword', () => {
    expect(validateRules({ ...DEFAULT_RULES, holdKeywords: ['ok', '  '] }).join(' ')).toMatch(/Hold keywords/)
  })
})
