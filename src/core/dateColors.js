import { differenceInDays } from 'date-fns'
import { STATUS, frequencyToDays } from './constants.js'
import { DEFAULT_RULES } from './rules.js'
import { replyHealth } from './replyStatus.js'

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

// Color the "last emailed" countdown relative to the venue's follow-up Frequency:
// fresh while inside the window, warming up once it's overdue. A confirmed gig or
// a non-emailing status stays calm.
export function lastEmailedColor(d, row, rules = DEFAULT_RULES) {
  if (row) {
    if (replyHealth(row) === 'gig') return GREEN
    if (LAST_EMAILED_MUTE.has(row._status)) return GRAY
  }
  const c = rules.dateColors
  const freqDays = frequencyToDays(row?.frequency, rules)
  const days = differenceInDays(new Date(), d)
  if (days <= freqDays * c.lastEmailedFreshRatio) return GREEN
  if (days <= freqDays * c.lastEmailedWarnRatio) return YELLOW
  if (days <= freqDays * c.lastEmailedOverdueRatio) return ORANGE
  return RED
}

// Color the follow-up countdown by what the row actually needs: only a genuinely
// due follow-up turns orange/red. If contact is recent, a gig is booked, or the
// row is otherwise resolved, the (possibly long-past) follow-up date stays calm.
export function followUpColor(d, row, rules = DEFAULT_RULES) {
  if (row && replyHealth(row) === 'gig') return GREEN
  const c = rules.dateColors
  // + = past/overdue, − = upcoming. The sign matters to every branch below.
  const days = differenceInDays(new Date(), d)
  const status = row?._status
  if (status === STATUS.FOLLOW_UP_DUE) return days > c.followUpDueRedAfterDays ? RED : ORANGE
  if (status === STATUS.FOLLOW_UP_PENDING) return days < -c.followUpPendingGreenBeforeDays ? GREEN : YELLOW
  if (status === undefined) {
    // No status context — fall back to the plain date gradient.
    if (days < -c.followUpPendingGreenBeforeDays) return GREEN
    if (days < 0) return YELLOW
    if (days <= c.followUpDueRedAfterDays) return ORANGE
    return RED
  }
  // Any other (resolved / no-action) status: the follow-up date isn't driving
  // anything, so don't paint it as overdue.
  return GRAY
}

// Recently played (or an upcoming gig) → too soon to rebook; the older it gets,
// the greener. Green once it passes the RECENTLY_PLAYED threshold.
export function lastPlayedColor(d, rules = DEFAULT_RULES) {
  const c = rules.dateColors
  const days = differenceInDays(new Date(), d)
  if (days < c.lastPlayedRedDays) return RED       // recent or upcoming
  if (days < c.lastPlayedOrangeDays) return ORANGE // in between
  return GREEN                                     // long enough ago
}

// A reply is a fresh lead — recent is best, fading to gray as it ages.
export function lastReplyColor(d, rules = DEFAULT_RULES) {
  const c = rules.dateColors
  const days = differenceInDays(new Date(), d)
  if (days <= c.lastReplyGreenDays) return GREEN
  if (days <= c.lastReplyLimeDays) return 'text-lime-500'
  if (days <= c.lastReplyOrangeDays) return ORANGE
  return GRAY
}
