import { ACTION_STATUSES } from './constants'

const BATCH_SIZE = 10

// The next batch is simply the first N rows whose classified status is
// actionable (see classifyBooking / ACTION_STATUSES). Deriving it from the
// already-computed _status keeps it a strict subset of the status badges, so it
// can never disagree with them (e.g. a "Festival (not now)" or "Recent contact"
// row can no longer leak into the batch).
export function computeNextBatch(rows, today, count = BATCH_SIZE) {
  const candidates = rows
    .filter(r => ACTION_STATUSES.has(r._status))
    .sort((a, b) => {
      const c = (a['Country'] || '').localeCompare(b['Country'] || '')
      if (c !== 0) return c
      const ci = (a['City'] || '').localeCompare(b['City'] || '')
      if (ci !== 0) return ci
      return (a['Venue'] || '').localeCompare(b['Venue'] || '')
    })
  return new Set(candidates.slice(0, count).map(r => r._idx))
}
