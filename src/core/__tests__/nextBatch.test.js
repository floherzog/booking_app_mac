import { describe, it, expect } from 'vitest'
import { computeNextBatch } from '@core/nextBatch'
import { STATUS } from '@core/constants'
import { DEFAULT_RULES, mergeRules } from '@core/rules'

const TODAY = new Date(2025, 5, 15)

function actionable(idx, extra = {}) {
  return { _idx: idx, _status: STATUS.SEND, Country: 'DE', City: 'Berlin', Venue: `V${idx}`, ...extra }
}

describe('computeNextBatch', () => {
  it('takes the first batchSize actionable rows', () => {
    const rows = Array.from({ length: 25 }, (_, i) => actionable(i, { Venue: `V${String(i).padStart(2, '0')}` }))
    expect(computeNextBatch(rows, TODAY).size).toBe(DEFAULT_RULES.batchSize)
    expect(computeNextBatch(rows, TODAY, mergeRules({ ...DEFAULT_RULES, batchSize: 3 })).size).toBe(3)
  })

  it('only considers action statuses', () => {
    const rows = [
      actionable(0),
      { _idx: 1, _status: STATUS.RECENT_CONTACT, Country: 'AT', City: 'Wien', Venue: 'A' },
      { _idx: 2, _status: STATUS.FOLLOW_UP_DUE, Country: 'AT', City: 'Wien', Venue: 'B' },
      { _idx: 3, _status: STATUS.NEVER_CONTACTED, Country: 'AT', City: 'Wien', Venue: 'C' },
      { _idx: 4, _status: STATUS.ON_HOLD, Country: 'AT', City: 'Wien', Venue: 'D' },
    ]
    expect([...computeNextBatch(rows, TODAY)].sort()).toEqual([0, 2, 3])
  })

  it('sorts by batchSortKeys in order', () => {
    const rows = [
      actionable(0, { Country: 'DE', City: 'Berlin', Venue: 'Zeta' }),
      actionable(1, { Country: 'AT', City: 'Wien', Venue: 'Alpha' }),
      actionable(2, { Country: 'DE', City: 'Aachen', Venue: 'Beta' }),
    ]
    const rules = mergeRules({ ...DEFAULT_RULES, batchSize: 2 })
    // Country → City → Venue: AT/Wien first, then DE/Aachen.
    expect([...computeNextBatch(rows, TODAY, rules)]).toEqual([1, 2])
    // Sorting by Venue alone flips the order.
    const byVenue = mergeRules({ ...DEFAULT_RULES, batchSize: 2, batchSortKeys: ['Venue'] })
    expect([...computeNextBatch(rows, TODAY, byVenue)]).toEqual([1, 2])
    const byVenueDesc = mergeRules({ ...DEFAULT_RULES, batchSize: 1, batchSortKeys: ['City'] })
    expect([...computeNextBatch(rows, TODAY, byVenueDesc)]).toEqual([2]) // Aachen
  })
})
