// How a bulk run turns into actual mail: a draft in the Drafts mailbox, or a
// message that goes out over SMTP. Pure, so both the preflight list in the
// renderer and the scheduler in main agree on what a run will do.

export const DELIVERY_MODES = [
  {
    id: 'draft',
    label: 'Drafts only',
    hint: 'Everything lands in Drafts for you to review and send by hand.',
  },
  {
    id: 'auto',
    label: 'Auto column decides',
    hint: 'Venues flagged Auto are sent straight away; every other venue is drafted.',
  },
  {
    id: 'send',
    label: 'Send now',
    hint: 'Every selected venue is emailed immediately. There is no undo.',
  },
]

export function isAutoSend(row) {
  return String(row?.['Auto'] ?? '').trim().toUpperCase() === 'TRUE'
}

// 'draft' | 'send' for one row under the chosen mode.
export function deliveryForRow(row, mode) {
  if (mode === 'send') return 'send'
  if (mode === 'auto') return isAutoSend(row) ? 'send' : 'draft'
  return 'draft'
}

// { draft, send } counts, for the button label and the warning line.
export function summarizeDelivery(rows, mode) {
  let draft = 0
  let send = 0
  for (const row of rows) {
    if (deliveryForRow(row, mode) === 'send') send += 1
    else draft += 1
  }
  return { draft, send }
}

// --- scheduling -------------------------------------------------------------
// A scheduled run only fires while the app is running. One that came due while
// the app was closed is run on the next launch rather than skipped, which is
// why "due" is `runAt <= now` and not a window around it.

export function isPending(job) {
  return job?.status === 'pending'
}

export function dueJobs(jobs, now = new Date()) {
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime()
  return (jobs || []).filter(j => isPending(j) && new Date(j.runAt).getTime() <= t)
}

export function pendingJobs(jobs) {
  return (jobs || []).filter(isPending).sort((a, b) => new Date(a.runAt) - new Date(b.runAt))
}

// The value of a <input type="datetime-local"> is local wall-clock time with no
// zone; Date() parses it as local, which is what the user meant.
export function parseLocalDateTime(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

// Rounded up to the next full 5 minutes, an hour out — a sane default for
// "later today" that is never already in the past.
export function defaultScheduleValue(now = new Date()) {
  const d = new Date(now.getTime() + 60 * 60 * 1000)
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
