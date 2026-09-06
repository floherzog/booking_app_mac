import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { app, ipcMain, BrowserWindow } from 'electron'
import { dueJobs, pendingJobs, nextOccurrence } from '../core/delivery.js'
import { appendDraftNow } from './ipc/mailImap.js'
import { sendMailNow } from './ipc/mailSmtp.js'

// A scheduled run comes in two shapes, and the difference is deliberate:
//
//   items  — a one-off run of already-rendered messages. What goes out is
//            exactly the list the preflight showed, even if a template or the
//            CSV changes in between. Main delivers these itself.
//   recipe — a repeating run ({ source, mode }). "Every day at 08:00" has to
//            mean *today's* next batch, so nothing is rendered in advance: when
//            it comes due, the renderer picks the venues and prepares the mail
//            with whatever is current, then reports back.
//
// This is an in-app scheduler, and it is honest about that: nothing fires while
// the app is closed. A run whose time passed in the meantime is executed at the
// next launch rather than dropped.

const TICK_MS = 30_000
const KEEP_JOBS = 50 // completed runs kept for the history list

let timer = null

function statePath() {
  return join(app.getPath('userData'), 'schedule.json')
}

export function readJobs() {
  try {
    const parsed = JSON.parse(readFileSync(statePath(), 'utf8'))
    return Array.isArray(parsed?.jobs) ? parsed.jobs : []
  } catch {
    return []
  }
}

function writeJobs(jobs) {
  const target = statePath()
  // Keep every pending job, but only the most recent finished ones.
  const finished = jobs.filter(j => j.status !== 'pending').slice(-KEEP_JOBS)
  const next = [...jobs.filter(j => j.status === 'pending'), ...finished]
  mkdirSync(dirname(target), { recursive: true })
  const tmp = `${target}.${process.pid}.tmp`
  try {
    writeFileSync(tmp, JSON.stringify({ jobs: next }, null, 2), 'utf8')
    renameSync(tmp, target)
  } catch (e) {
    if (existsSync(tmp)) { try { unlinkSync(tmp) } catch { /* ignore */ } }
    throw e
  }
  return next
}

function broadcast(payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('schedule:updated', payload)
  }
}

// { runAt, mode, repeat, items } or { runAt, mode, repeat, recipe } → the job
export function addJob({ runAt, mode, repeat = 'once', items, recipe }) {
  const when = new Date(runAt)
  if (Number.isNaN(when.getTime())) throw new Error('That is not a valid date and time.')
  const repeats = repeat === 'daily' || repeat === 'weekly'
  if (!repeats && (!Array.isArray(items) || items.length === 0)) throw new Error('Nothing to schedule.')
  if (repeats && !recipe?.source) throw new Error('A repeating run needs a source to pick venues from.')

  // "Every day at 08:00", set up at 10:00, means tomorrow — not right now.
  const firstAt = repeats && when.getTime() <= Date.now()
    ? new Date(nextOccurrence(when.toISOString(), repeat))
    : when

  const job = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    runAt: firstAt.toISOString(),
    mode: mode || 'draft',
    repeat: repeats ? repeat : 'once',
    status: 'pending',
    // Exactly one of these. A repeating job is re-prepared on every run.
    ...(repeats
      ? { recipe: { source: recipe.source, mode: mode || 'draft' } }
      : { items: items.map(i => ({ ...i, delivery: i.delivery === 'send' ? 'send' : 'draft' })) }),
    results: [],
  }
  writeJobs([...readJobs(), job])
  broadcast({ reason: 'added', jobs: readJobs() })
  return job
}

export function cancelJob(id) {
  const jobs = readJobs().map(j => (j.id === id && j.status === 'pending' ? { ...j, status: 'cancelled', finishedAt: new Date().toISOString() } : j))
  writeJobs(jobs)
  broadcast({ reason: 'cancelled', jobs: readJobs() })
  return readJobs()
}

// Sequential on purpose, same as the interactive bulk run: each message opens
// its own connection and servers throttle bursts of logins.
export async function runJob(job, { deliver = defaultDeliver } = {}) {
  const results = []
  for (const item of job.items) {
    try {
      await deliver(item)
      results.push({ key: item.key, delivery: item.delivery, ok: true })
    } catch (e) {
      results.push({ key: item.key, delivery: item.delivery, ok: false, error: e.message })
    }
  }
  return results
}

function defaultDeliver(item) {
  return item.delivery === 'send' ? sendMailNow(item.draft) : appendDraftNow(item.draft)
}

// Where a run ends up: finished for good, or rolled forward to its next slot.
// Called for both shapes of job, so recurrence lives in exactly one place.
export function finishJob(id, results, now = new Date()) {
  const job = readJobs().find(j => j.id === id)
  if (!job) return null
  const nextAt = nextOccurrence(job.runAt, job.repeat, now)
  updateJob(id, nextAt
    ? { status: 'pending', runAt: nextAt, lastRunAt: now.toISOString(), results }
    : { status: 'done', finishedAt: now.toISOString(), results })
  broadcast({ reason: 'completed', jobId: id, results, jobs: readJobs() })
  return readJobs().find(j => j.id === id)
}

// A repeating run is executed by the renderer (it is the side that knows the
// current venues and templates); main only hands it the recipe. No window means
// no run — the job stays pending and is picked up on the next tick.
function dispatchToRenderer(job) {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return false
  updateJob(job.id, { status: 'running', startedAt: new Date().toISOString() })
  win.webContents.send('schedule:updated', { reason: 'run', job: readJobs().find(j => j.id === job.id) })
  return true
}

// The renderer's answer to a dispatch. `deferred` means it was not ready (rows
// still loading right after launch), so the job goes back in the queue untouched.
export function reportRun(id, { results = [], deferred = false } = {}, now = new Date()) {
  const job = readJobs().find(j => j.id === id)
  if (!job || job.status !== 'running') return null
  if (deferred) {
    updateJob(id, { status: 'pending', startedAt: null })
    return readJobs().find(j => j.id === id)
  }
  return finishJob(id, results, now)
}

// Marked as running before the first message goes out, so a crash mid-run can
// never replay a send on the next launch.
export async function runDueJobs(now = new Date(), opts = {}) {
  const due = dueJobs(readJobs(), now)
  let started = 0
  for (const job of due) {
    if (job.recipe) {
      if (dispatchToRenderer(job)) started += 1
      continue
    }
    updateJob(job.id, { status: 'running', startedAt: new Date().toISOString() })
    const results = await runJob(job, opts)
    finishJob(job.id, results, new Date())
    started += 1
  }
  return started
}

// A job left 'running' by a quit or a crash is never re-run: for a one-off that
// means it is finished with whatever it managed, and for a repeating one it
// moves on to its next slot. Replaying a run that may already have sent mail is
// the one outcome worth ruling out.
export function recoverInterruptedJobs(now = new Date()) {
  const interrupted = readJobs().filter(j => j.status === 'running')
  for (const job of interrupted) {
    finishJob(job.id, [...(job.results || []), { key: null, ok: false, error: 'Booking was closed while this run was in progress.' }], now)
  }
  return interrupted.length
}

function updateJob(id, patch) {
  writeJobs(readJobs().map(j => (j.id === id ? { ...j, ...patch } : j)))
}

export function startScheduler() {
  if (timer) return
  recoverInterruptedJobs()
  // A first pass right away catches runs that came due while the app was closed.
  const tick = () => { runDueJobs().catch(err => console.error('[scheduler]', err)) }
  tick()
  timer = setInterval(tick, TICK_MS)
}

export function stopScheduler() {
  if (timer) clearInterval(timer)
  timer = null
}

export function registerScheduleIpc() {
  ipcMain.handle('schedule:list', () => readJobs())
  ipcMain.handle('schedule:pending', () => pendingJobs(readJobs()))
  ipcMain.handle('schedule:add', (_e, spec) => addJob(spec))
  ipcMain.handle('schedule:cancel', (_e, id) => cancelJob(id))
  ipcMain.handle('schedule:report', (_e, id, payload) => reportRun(id, payload))
}
