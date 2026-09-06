import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir

// app.getPath('userData') is where schedule.json lives; point it at a temp dir.
let sent = []
let windows = []

vi.mock('electron', () => ({
  ipcMain: { handle: () => {} },
  BrowserWindow: { getAllWindows: () => windows },
  app: { getPath: () => dir },
}))
vi.mock('imapflow', () => ({ ImapFlow: class {} }))
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({}) } }))

const { addJob, cancelJob, readJobs, runJob, runDueJobs, reportRun, recoverInterruptedJobs } = await import('../scheduler.js')

const item = (key, delivery) => ({ key, venue: key, email: `${key}@example.com`, delivery, draft: { to: `${key}@example.com` } })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'booking-sched-'))
  sent = []
  windows = [{ webContents: { send: (channel, payload) => sent.push({ channel, payload }) } }]
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('addJob', () => {
  it('stores a pending job with the rendered messages', () => {
    const job = addJob({ runAt: '2030-01-01T10:00:00.000Z', mode: 'auto', items: [item('a', 'send'), item('b', 'draft')] })
    expect(job.status).toBe('pending')
    expect(existsSync(join(dir, 'schedule.json'))).toBe(true)
    expect(readJobs()).toHaveLength(1)
    expect(readJobs()[0].items.map(i => i.delivery)).toEqual(['send', 'draft'])
  })

  it('normalises an unknown delivery to a draft — never to a send', () => {
    const job = addJob({ runAt: '2030-01-01T10:00:00.000Z', mode: 'draft', items: [item('a', 'whatever')] })
    expect(job.items[0].delivery).toBe('draft')
  })

  it('rejects an empty run and an unparseable time', () => {
    expect(() => addJob({ runAt: '2030-01-01T10:00:00.000Z', items: [] })).toThrow(/nothing/i)
    expect(() => addJob({ runAt: 'soon', items: [item('a', 'draft')] })).toThrow(/valid date/i)
  })
})

describe('cancelJob', () => {
  it('marks the job cancelled so it never fires', async () => {
    const job = addJob({ runAt: '2000-01-01T10:00:00.000Z', items: [item('a', 'draft')] })
    cancelJob(job.id)
    expect(readJobs()[0].status).toBe('cancelled')

    const deliver = vi.fn()
    await runDueJobs(new Date(), { deliver })
    expect(deliver).not.toHaveBeenCalled()
  })
})

describe('runJob', () => {
  it('reports one result per item and keeps going after a failure', async () => {
    const job = { items: [item('a', 'send'), item('b', 'draft'), item('c', 'draft')] }
    const deliver = vi.fn(async i => { if (i.key === 'b') throw new Error('server said no') })
    const results = await runJob(job, { deliver })

    expect(deliver).toHaveBeenCalledTimes(3)
    expect(results).toEqual([
      { key: 'a', delivery: 'send', ok: true },
      { key: 'b', delivery: 'draft', ok: false, error: 'server said no' },
      { key: 'c', delivery: 'draft', ok: true },
    ])
  })
})

describe('runDueJobs', () => {
  it('runs a job whose time passed while the app was closed, exactly once', async () => {
    addJob({ runAt: '2020-05-05T10:00:00.000Z', mode: 'send', items: [item('a', 'send')] })
    const deliver = vi.fn()

    expect(await runDueJobs(new Date(), { deliver })).toBe(1)
    expect(deliver).toHaveBeenCalledTimes(1)

    // Second pass: the job is done, so nothing is replayed.
    expect(await runDueJobs(new Date(), { deliver })).toBe(0)
    expect(deliver).toHaveBeenCalledTimes(1)

    const stored = JSON.parse(readFileSync(join(dir, 'schedule.json'), 'utf8')).jobs[0]
    expect(stored.status).toBe('done')
    expect(stored.results).toEqual([{ key: 'a', delivery: 'send', ok: true }])
  })

  it('leaves a job whose time has not come alone', async () => {
    addJob({ runAt: '2099-01-01T10:00:00.000Z', items: [item('a', 'draft')] })
    const deliver = vi.fn()
    expect(await runDueJobs(new Date(), { deliver })).toBe(0)
    expect(deliver).not.toHaveBeenCalled()
    expect(readJobs()[0].status).toBe('pending')
  })
})

describe('repeating runs', () => {
  const recipe = { source: 'nextBatch' }

  it('stores a recipe rather than frozen messages', () => {
    const job = addJob({ runAt: '2030-01-01T08:00:00.000Z', mode: 'draft', repeat: 'daily', recipe })
    expect(job.recipe).toEqual({ source: 'nextBatch', mode: 'draft' })
    expect(job.items).toBeUndefined()
  })

  it('starts at the next slot when the time of day has already passed', () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const job = addJob({ runAt: past, repeat: 'daily', recipe })
    expect(new Date(job.runAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('refuses a repeating run with no source', () => {
    expect(() => addJob({ runAt: '2030-01-01T08:00:00.000Z', repeat: 'weekly' })).toThrow(/source/i)
  })

  it('hands the recipe to the renderer instead of delivering it in main', async () => {
    const job = addJob({ runAt: '2020-01-01T08:00:00.000Z', repeat: 'daily', recipe })
    // Force it due: addJob rolled it into the future, so rewind by hand.
    const deliver = vi.fn()
    await runDueJobs(new Date(new Date(readJobs()[0].runAt).getTime() + 1000), { deliver })

    expect(deliver).not.toHaveBeenCalled()
    const dispatched = sent.filter(m => m.payload.reason === 'run')
    expect(dispatched).toHaveLength(1)
    expect(dispatched[0].channel).toBe('schedule:updated')
    expect(dispatched[0].payload.job.id).toBe(job.id)
    expect(dispatched[0].payload.job.recipe).toEqual({ source: 'nextBatch', mode: 'draft' })
    expect(readJobs()[0].status).toBe('running')
  })

  it('rolls forward to the next slot when the renderer reports back', async () => {
    const job = addJob({ runAt: '2020-01-01T08:00:00.000Z', repeat: 'daily', recipe })
    const firstRunAt = readJobs()[0].runAt
    await runDueJobs(new Date(new Date(firstRunAt).getTime() + 1000), { deliver: vi.fn() })

    reportRun(job.id, { results: [{ key: 'a', delivery: 'draft', ok: true }] })
    const stored = readJobs()[0]
    expect(stored.status).toBe('pending')
    expect(new Date(stored.runAt).getTime()).toBeGreaterThan(new Date(firstRunAt).getTime())
    expect(stored.results).toHaveLength(1)
  })

  it('puts a deferred run straight back in the queue, unchanged', async () => {
    const job = addJob({ runAt: '2020-01-01T08:00:00.000Z', repeat: 'daily', recipe })
    const runAt = readJobs()[0].runAt
    await runDueJobs(new Date(new Date(runAt).getTime() + 1000), { deliver: vi.fn() })

    reportRun(job.id, { deferred: true })
    expect(readJobs()[0]).toMatchObject({ status: 'pending', runAt })
  })

  it('does not dispatch while no window is open', async () => {
    windows = []
    addJob({ runAt: '2020-01-01T08:00:00.000Z', repeat: 'daily', recipe })
    const runAt = readJobs()[0].runAt
    expect(await runDueJobs(new Date(new Date(runAt).getTime() + 1000), { deliver: vi.fn() })).toBe(0)
    expect(readJobs()[0].status).toBe('pending')
  })

  it('never replays a run that was interrupted — it moves to the next slot', async () => {
    const job = addJob({ runAt: '2020-01-01T08:00:00.000Z', repeat: 'daily', recipe })
    const runAt = readJobs()[0].runAt
    await runDueJobs(new Date(new Date(runAt).getTime() + 1000), { deliver: vi.fn() })

    expect(recoverInterruptedJobs()).toBe(1)
    const stored = readJobs().find(j => j.id === job.id)
    expect(stored.status).toBe('pending')
    expect(new Date(stored.runAt).getTime()).toBeGreaterThan(new Date(runAt).getTime())
    expect(stored.results.some(r => /closed/i.test(r.error || ''))).toBe(true)
  })

  it('finishes an interrupted one-off run instead of re-sending it', async () => {
    addJob({ runAt: '2020-01-01T08:00:00.000Z', items: [item('a', 'send')] })
    // Simulate a quit between "running" and the results being written.
    const deliver = () => new Promise(() => {})
    const pending = runDueJobs(new Date(), { deliver })
    await Promise.resolve()
    expect(readJobs()[0].status).toBe('running')

    recoverInterruptedJobs()
    expect(readJobs()[0].status).toBe('done')
    void pending
  })
})
