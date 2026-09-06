import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { app, ipcMain, BrowserWindow } from 'electron'
import { dueJobs, pendingJobs } from '../core/delivery.js'
import { appendDraftNow } from './ipc/mailImap.js'
import { sendMailNow } from './ipc/mailSmtp.js'

// A scheduled run is a list of already-rendered messages plus a time. Rendering
// happens when the run is scheduled, not when it fires: what goes out is exactly
// what the preflight showed, even if a template is edited in between.
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

// { runAt, mode, items: [{ key, venue, email, delivery, draft }] } → the job
export function addJob({ runAt, mode, items }) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('Nothing to schedule.')
  const when = new Date(runAt)
  if (Number.isNaN(when.getTime())) throw new Error('That is not a valid date and time.')

  const job = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    runAt: when.toISOString(),
    mode: mode || 'draft',
    status: 'pending',
    items: items.map(i => ({ ...i, delivery: i.delivery === 'send' ? 'send' : 'draft' })),
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

// Marked as running before the first message goes out, so a crash mid-run can
// never replay a send on the next launch.
export async function runDueJobs(now = new Date(), opts = {}) {
  const due = dueJobs(readJobs(), now)
  for (const job of due) {
    updateJob(job.id, { status: 'running', startedAt: new Date().toISOString() })
    const results = await runJob(job, opts)
    updateJob(job.id, {
      status: 'done',
      finishedAt: new Date().toISOString(),
      results,
    })
    broadcast({ reason: 'completed', jobId: job.id, results, jobs: readJobs() })
  }
  return due.length
}

function updateJob(id, patch) {
  writeJobs(readJobs().map(j => (j.id === id ? { ...j, ...patch } : j)))
}

export function startScheduler() {
  if (timer) return
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
}
