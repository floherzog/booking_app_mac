import { replyHealth } from '@core/replyStatus'

// How a venue's reply health looks, in one place.
//
// The colours live here rather than in core because core stays DOM-free, and
// here rather than in BookingTable because the venue detail view shows the same
// thing — a colour with no legend is a puzzle, so the detail view spells it out.
//
// The scale reads worst-to-best as red → orange → yellow → green: never answered,
// only a machine answered, answered, booked.
export const HEALTH_META = {
  gig: {
    label: 'Gig booked',
    hint: 'A gig is on the books for a future date.',
    row: 'bg-green-50 dark:bg-green-900/15',
    dot: 'bg-green-400',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  reply: {
    label: 'Replied',
    hint: 'Someone at this venue has written back.',
    row: 'bg-yellow-50 dark:bg-yellow-900/15',
    dot: 'bg-yellow-400',
    badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  'auto-reply': {
    label: 'Auto-reply only',
    hint: 'Only an out-of-office or autoresponder came back — nobody has actually answered.',
    row: 'bg-orange-50 dark:bg-orange-900/15',
    dot: 'bg-orange-400',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  },
  silent: {
    label: 'Never replied',
    hint: 'Emailed at least once, with no answer of any kind on record.',
    row: 'bg-red-50 dark:bg-red-900/15',
    dot: 'bg-red-400',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  none: {
    label: 'Not contacted',
    hint: 'No email has gone out to this venue yet.',
    row: '',
    dot: 'bg-gray-300 dark:bg-gray-600',
    badge: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300',
  },
}

export function healthMeta(row) {
  return HEALTH_META[replyHealth(row)] || HEALTH_META.none
}
