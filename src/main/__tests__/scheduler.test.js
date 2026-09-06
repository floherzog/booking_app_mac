import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir

// app.getPath('userData') is where schedule.json lives; point it at a temp dir.
vi.mock('electron', () => ({
  ipcMain: { handle: () => {} },
  BrowserWindow: { getAllWindows: () => [] },
  app: { getPath: () => dir },
}))
vi.mock('imapflow', () => ({ ImapFlow: class {} }))
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({}) } }))

const { addJob, cancelJob, readJobs, runJob, runDueJobs } = await import('../scheduler.js')

const item = (key, delivery) => ({ key, venue: key, email: `${key}@example.com`, delivery, draft: { to: `${key}@example.com` } })

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'booking-sched-')) })
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
