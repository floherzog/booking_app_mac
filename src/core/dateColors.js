import { differenceInDays } from 'date-fns'
import { STATUS, frequencyToDays } from './constants'
import { replyHealth } from './replyStatus'

const GREEN = 'text-green-500'
const YELLOW = 'text-yellow-500'
const ORANGE = 'text-orange-500'
const RED = 'text-red-500'
const GRAY = 'text-gray-400'

// Statuses where re-emailing isn't the pending concern, so an old "last emailed"
// date shouldn't alarm (would otherwise show orange/red for no reason).
const LAST_EMAILED_MUTE = new Set([
  STATUS.RECENTLY_PLAYED, STATUS.ON_HOLD, STATUS.FESTIVAL_INELIGIBLE,
  STATUS.DEAD, STATUS.MISSING_INFO,
])

// Color the "last emailed" countdown relative to the venue's follow-up Frequency
// (default 30 days): fresh while inside the window, warming up once it's overdue.
// A confirmed gig or a non-emailing status stays calm.
export function lastEmailedColor(d, row) {
  if (row) {
    if (replyHealth(row) === 'gig') return GREEN
    if (LAST_EMAILED_MUTE.has(row._status)) return GRAY
  }
  const freqDays = frequencyToDays(row?.frequency)
  const days = differenceInDays(new Date(), d)
  if (days <= freqDays * 0.5) return GREEN
  if (days <= freqDays) return YELLOW
  if (days <= freqDays * 2) return ORANGE
  return RED
}

// Color the follow-up countdown by what the row actually needs: only a genuinely
// due follow-up turns orange/red. If contact is recent, a gig is booked, or the
// row is otherwise resolved, the (possibly long-past) follow-up date stays calm.
export function followUpColor(d, row) {
  if (row && replyHealth(row) === 'gig') return GREEN
  const days = differenceInDays(new Date(), d) // + = past/overdue, − = upcoming
  const status = row?._status
  if (status === STATUS.FOLLOW_UP_DUE) return days > 7 ? RED : ORANGE
  if (status === STATUS.FOLLOW_UP_PENDING) return days < -14 ? GREEN : YELLOW
  if (status === undefined) {
    // No status context — fall back to the plain date gradient.
    if (days < -14) return GREEN
    if (days < 0) return YELLOW
    if (days <= 7) return ORANGE
    return RED
  }
  // Any other (resolved / no-action) status: the follow-up date isn't driving
  // anything, so don't paint it as overdue.
  return GRAY
}

// Recently played (or an upcoming gig) → too soon to rebook; the older it gets,
// the greener. Green once it's been over a year (the RECENTLY_PLAYED threshold).
export function lastPlayedColor(d) {
  const days = differenceInDays(new Date(), d)
  if (days < 182) return RED    // within ~6 months or upcoming
  if (days < 365) return ORANGE // 6 months – 1 year
  return GREEN                   // over a year ago
}

// A reply is a fresh lead — recent is best, fading to gray as it ages.
export function lastReplyColor(d) {
  const days = differenceInDays(new Date(), d)
  if (days <= 30) return GREEN
  if (days <= 90) return 'text-lime-500'
  if (days <= 365) return ORANGE
  return GRAY
}
