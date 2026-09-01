import { ACTION_STATUSES } from './constants.js'
import { DEFAULT_RULES } from './rules.js'

// The next batch is simply the first N rows whose classified status is
// actionable (see classifyBooking / ACTION_STATUSES). Deriving it from the
// already-computed _status keeps it a strict subset of the status badges, so it
// can never disagree with them (e.g. a "Festival (not now)" or "Recent contact"
// row can no longer leak into the batch). Size and sort order come from the rules.
export function computeNextBatch(rows, today, rules = DEFAULT_RULES) {
  const sortKeys = rules.batchSortKeys?.length ? rules.batchSortKeys : DEFAULT_RULES.batchSortKeys
  const candidates = rows
    .filter(r => ACTION_STATUSES.has(r._status))
    .sort((a, b) => {
      for (const key of sortKeys) {
        const c = (a[key] || '').localeCompare(b[key] || '')
        if (c !== 0) return c
      }
      return 0
    })
  return new Set(candidates.slice(0, rules.batchSize).map(r => r._idx))
}
