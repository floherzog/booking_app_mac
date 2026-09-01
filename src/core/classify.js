import { differenceInDays, addMonths, subMonths } from 'date-fns'
import { HOLD_KEYWORDS, HOLD_OVERRIDE_DAYS, STATUS, isSendBlocked, frequencyToDays } from './constants'
import { parseDate, parseMonthsFromTimeFrame } from './parseDate'

function hasHoldKeyword(note) {
  if (!note) return false
  const lower = note.toLowerCase()
  return HOLD_KEYWORDS.some(kw => lower.includes(kw))
}

function festivalInWindow(timeFrame, today) {
  const months = parseMonthsFromTimeFrame(timeFrame)
  if (months.length === 0) return false
  const futureLimit = addMonths(today, 3)
  const pastLimit = subMonths(today, 2)
  // The booking window is CLOSED when the nearest occurrence of the festival's
  // month falls in the dead zone [2 months past, 3 months future] — too close to
  // book. It's open (eligible) only when no occurrence lands in that zone, i.e.
  // the festival is still >3 months out or already >2 months past.
  return !months.some(m => {
    const candidates = [
      new Date(today.getFullYear() - 1, m, 1),
      new Date(today.getFullYear(), m, 1),
      new Date(today.getFullYear() + 1, m, 1),
    ]
    return candidates.some(d => d >= pastLimit && d <= futureLimit)
  })
}

export function classifyBooking(row, today) {
  const type = (row['Type'] || '').toLowerCase().trim()
  const note = row['Note'] || ''
  const followUpRaw = row['Follow Up Date'] || ''
  const lastEmailedRaw = row['Last emailed'] || ''
  const timeFrame = row['Time Frame'] || ''

  if (type === 'dead') return STATUS.DEAD

  // Missing a field required to send (venue/band/email) → keep out of every
  // send/follow-up list; the red "!" flag is enough of a prompt to fix it.
  if (isSendBlocked(row)) return STATUS.MISSING_INFO

  // Played within the last year (or a future/upcoming gig) → not for booking
  // outreach right now. Mirrors the next-batch policy.
  const lastPlayed = parseDate(row['Last played'] || '')
  if (lastPlayed && differenceInDays(today, lastPlayed) < 365) return STATUS.RECENTLY_PLAYED

  const lastEmailed = parseDate(lastEmailedRaw)
  // Per-venue re-contact window (Frequency column), defaulting to 30 days.
  const freqDays = frequencyToDays(row['frequency'])

  if (hasHoldKeyword(note)) {
    const holdExpired = lastEmailed && differenceInDays(today, lastEmailed) >= HOLD_OVERRIDE_DAYS
    if (!holdExpired) return STATUS.ON_HOLD
  }

  if (type === 'festival') {
    if (!festivalInWindow(timeFrame, today)) return STATUS.FESTIVAL_INELIGIBLE
  }

  const followUpDate = parseDate(followUpRaw)

  // Stale follow-up: emailed on or after the follow-up date → follow-up is fulfilled
  if (followUpDate && lastEmailed && lastEmailed >= followUpDate) {
    const daysAgo = differenceInDays(today, lastEmailed)
    return daysAgo <= freqDays ? STATUS.RECENT_CONTACT : STATUS.SEND
  }

  if (followUpDate) {
    return followUpDate <= today ? STATUS.FOLLOW_UP_DUE : STATUS.FOLLOW_UP_PENDING
  }

  if (!lastEmailed) return STATUS.NEVER_CONTACTED

  const daysAgo = differenceInDays(today, lastEmailed)
  return daysAgo <= freqDays ? STATUS.RECENT_CONTACT : STATUS.SEND
}
