export const HOLD_OVERRIDE_DAYS = 365

// Default re-contact window when a venue has no Frequency set.
export const DEFAULT_FREQUENCY_DAYS = 30

// Frequency column → re-contact window in days. Empty/unset falls back to the
// default. Presets and custom values are stored as "N months" (e.g. "2 months");
// a "N days" form is also accepted for robustness.
export function frequencyToDays(freq) {
  if (!freq) return DEFAULT_FREQUENCY_DAYS
  const m = String(freq).match(/(\d+)/)
  if (!m) return DEFAULT_FREQUENCY_DAYS
  const n = parseInt(m[1], 10)
  if (!n) return DEFAULT_FREQUENCY_DAYS
  return /day/i.test(freq) ? n : n * 30
}

export const HOLD_KEYWORDS = [
  'anrufen', 'telefon', 'phone', 'call', 'keine email', 'no email',
  'nicht emailen', 'nicht mailen', 'vorerst keine', 'erstmal keine',
  "dont email", "don't email", 'nächstes jahr', 'next year', 'frühestens',
  'warten', 'wait', 'später', 'later', 'pause', 'kein outreach',
  'already in contact', 'already talking', 'bereits in kontakt', 'schon in kontakt',
  'erst nächstes jahr', 'im austausch', 'ongoing conversation',
  'keine reminder', 'kein reminder', 'no reminder', 'no reminders',
  'melden sich bei interesse', 'will get back', 'they will get back',
]

export const STATUS = {
  SEND: 'SEND',
  FOLLOW_UP_DUE: 'FOLLOW_UP_DUE',
  FOLLOW_UP_PENDING: 'FOLLOW_UP_PENDING',
  NEVER_CONTACTED: 'NEVER_CONTACTED',
  ON_HOLD: 'ON_HOLD',
  RECENT_CONTACT: 'RECENT_CONTACT',
  RECENTLY_PLAYED: 'RECENTLY_PLAYED',
  FESTIVAL_INELIGIBLE: 'FESTIVAL_INELIGIBLE',
  MISSING_INFO: 'MISSING_INFO',
  DEAD: 'DEAD',
}

export const STATUS_META = {
  [STATUS.SEND]: {
    label: 'Send',
    description: 'Last contacted more than 30 days ago — eligible to email again.',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    row: 'border-l-4 border-amber-400',
    mapColor: '#F59E0B',
    priority: 1,
  },
  [STATUS.FOLLOW_UP_DUE]: {
    label: 'Follow Up',
    description: 'Scheduled follow-up date has passed — time to check in.',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    row: 'border-l-4 border-red-500',
    mapColor: '#EF4444',
    priority: 2,
  },
  [STATUS.NEVER_CONTACTED]: {
    label: 'Never Contacted',
    description: 'No outreach on record — fresh candidate for a first email.',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    row: 'border-l-4 border-violet-400',
    mapColor: '#8B5CF6',
    priority: 3,
  },
  [STATUS.FOLLOW_UP_PENDING]: {
    label: 'Waiting',
    description: 'Follow-up date is set in the future — check back then.',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    row: '',
    mapColor: '#3B82F6',
    priority: 4,
  },
  [STATUS.RECENT_CONTACT]: {
    label: 'Recent',
    description: 'Emailed within the last 30 days — too soon to follow up.',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    row: '',
    mapColor: '#22C55E',
    priority: 5,
  },
  [STATUS.ON_HOLD]: {
    label: 'On Hold',
    description: 'Note contains a hold marker (e.g. "warten", "anrufen", "next year") — skipped by the booking script.',
    badge: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
    row: 'opacity-60',
    mapColor: '#9CA3AF',
    priority: 6,
  },
  [STATUS.RECENTLY_PLAYED]: {
    label: 'Recently Played',
    description: 'Last played less than a year ago (or has an upcoming gig) — skipped for booking outreach until more than a year has passed.',
    badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    row: 'opacity-70',
    mapColor: '#14B8A6',
    priority: 7,
  },
  [STATUS.FESTIVAL_INELIGIBLE]: {
    label: 'Festival (not now)',
    description: 'Festival booking window is not open right now — must be more than 3 months out or more than 2 months past.',
    badge: 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300',
    row: 'opacity-70',
    mapColor: '#0EA5E9',
    priority: 8,
  },
  [STATUS.MISSING_INFO]: {
    label: 'Missing Info',
    description: 'Missing a field required to send (venue name, band, or email). Fix the flagged fields before it can be emailed — hidden from send/follow-up lists until then.',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    row: 'border-l-4 border-orange-400',
    mapColor: '#FB923C',
    priority: 9,
  },
  [STATUS.DEAD]: {
    label: 'Dead',
    description: 'Type is set to "dead" — no longer being booked, excluded from all outreach.',
    badge: 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500',
    row: 'opacity-50',
    mapColor: '#A1A1AA',
    priority: 10,
  },
}

export const ACTION_STATUSES = new Set([STATUS.SEND, STATUS.FOLLOW_UP_DUE, STATUS.NEVER_CONTACTED])

// Columns offered in the advanced filter/sort panel. `type` drives how the
// value is compared: 'status' = classification priority, 'date' = parsed date,
// otherwise case-insensitive substring (filter) / locale string (sort).
// Reply-health categories (see replyHealth() in replyStatus.js). Order = sort rank,
// from best news (confirmed gig) to worst (no response).
export const HEALTH_OPTIONS = [
  { key: 'gig', label: 'Confirmed gig (green)' },
  { key: 'reply', label: 'Replied' },
  { key: 'none', label: 'Not contacted yet' },
  { key: 'auto-reply', label: 'Auto-reply only (yellow)' },
  { key: 'silent', label: 'No response (red)' },
]
export const HEALTH_RANK = Object.fromEntries(HEALTH_OPTIONS.map((o, i) => [o.key, i]))

export const ADVANCED_COLUMNS = [
  { key: '_status', label: 'Status badge (Send/Follow-up/…)', type: 'status' },
  { key: '_health', label: 'Reply health (color)', type: 'health' },
  { key: 'Venue', label: 'Venue' },
  { key: 'City', label: 'City' },
  { key: 'Country', label: 'Country' },
  { key: 'Band', label: 'Band' },
  { key: 'Email', label: 'Email' },
  { key: 'Contact', label: 'Contact' },
  { key: 'Website', label: 'Website' },
  { key: 'Type', label: 'Type' },
  { key: 'Note', label: 'Note' },
  { key: 'Status', label: 'Last Reply' },
  { key: 'Total emails', label: 'Total Emails', type: 'number' },
  { key: 'Recent emails', label: 'Recent Emails (since last reply)', type: 'number' },
  { key: 'Last emailed', label: 'Last Emailed', type: 'date' },
  { key: 'Follow Up Date', label: 'Follow Up', type: 'date' },
  { key: 'Last played', label: 'Last Played', type: 'date' },
  { key: 'Time Frame', label: 'Time Frame' },
  { key: 'Dates', label: 'Dates' },
  { key: 'Text', label: 'Text' },
  { key: 'frequency', label: 'Frequency' },
]

// The app's real CSV columns, in canonical order. Single source of truth for the
// import wizard's mapping targets and the key set every imported row carries.
export const APP_COLUMNS = [
  { key: 'Venue', label: 'Venue' },
  { key: 'Band', label: 'Band' },
  { key: 'Type', label: 'Type' },
  { key: 'City', label: 'City' },
  { key: 'Country', label: 'Country' },
  { key: 'Contact', label: 'Contact' },
  { key: 'Email', label: 'Email' },
  { key: 'Website', label: 'Website' },
  { key: 'Time Frame', label: 'Time Frame' },
  { key: 'Dates', label: 'Dates' },
  { key: 'Text', label: 'Outreach text' },
  { key: 'Last emailed', label: 'Last Emailed' },
  { key: 'Follow Up Date', label: 'Follow Up Date' },
  { key: 'frequency', label: 'Frequency' },
  { key: 'Last played', label: 'Last Played' },
  { key: 'Status', label: 'Reply status' },
  { key: 'Note', label: 'Note' },
  { key: 'Total emails', label: 'Total Emails' },
  { key: 'Recent emails', label: 'Recent Emails' },
  { key: 'Draft', label: 'Draft' },
  { key: 'Auto', label: 'Auto' },
  { key: 'filler', label: 'filler' },
]

export const DEFAULT_CONFIG = {
  csvRepo: 'floherzog/booking_list',
  csvPath: 'data/booking_junolist_current.csv',
  scriptRepo: 'floherzog/openclaw-backup',
  scriptPath: 'scripts/create_booking_batch.py',
  bands: [],
}

export const CRITICAL_FIELDS = ['Venue', 'Email', 'Band', 'Contact']

// Fields without which an outreach email cannot be sent at all. A venue missing
// any of these is hidden from the send/follow-up lists (classified MISSING_INFO)
// and surfaced only via the red "!" flag and the Missing info filter.
export const SEND_REQUIRED_FIELDS = ['Venue', 'Band', 'Email']

export function isSendBlocked(row) {
  return SEND_REQUIRED_FIELDS.some(f => !row[f]?.trim())
}

export function getMissingFields(row) {
  const missing = []
  CRITICAL_FIELDS.forEach(f => { if (!row[f]?.trim()) missing.push(f) })
  if (!row['City']?.trim() && !row['Country']?.trim()) missing.push('Location')
  return missing
}

// 3 = red (venue/email), 2 = orange (band), 1 = yellow (contact/location), 0 = none
export function getMissingSeverity(row) {
  if (!row['Venue']?.trim() || !row['Email']?.trim()) return 3
  if (!row['Band']?.trim()) return 2
  if (!row['Contact']?.trim() || (!row['City']?.trim() && !row['Country']?.trim())) return 1
  return 0
}
