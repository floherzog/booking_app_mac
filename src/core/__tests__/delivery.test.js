import { describe, it, expect } from 'vitest'
import {
  deliveryForRow, isAutoSend, summarizeDelivery,
  dueJobs, pendingJobs, parseLocalDateTime, defaultScheduleValue,
} from '../delivery.js'

const auto = { Venue: 'A', Auto: 'TRUE' }
const manual = { Venue: 'B', Auto: '' }

describe('deliveryForRow', () => {
  it('drafts everything in draft mode, regardless of the Auto column', () => {
    expect(deliveryForRow(auto, 'draft')).toBe('draft')
    expect(deliveryForRow(manual, 'draft')).toBe('draft')
  })

  it('sends everything in send mode', () => {
    expect(deliveryForRow(auto, 'send')).toBe('send')
    expect(deliveryForRow(manual, 'send')).toBe('send')
  })

  it('lets the Auto column decide in auto mode', () => {
    expect(deliveryForRow(auto, 'auto')).toBe('send')
    expect(deliveryForRow(manual, 'auto')).toBe('draft')
  })

  it('defaults to drafting for an unknown mode', () => {
    expect(deliveryForRow(auto, undefined)).toBe('draft')
  })
})

describe('isAutoSend', () => {
  it('accepts the CSV spellings and nothing else', () => {
    expect(isAutoSend({ Auto: 'TRUE' })).toBe(true)
    expect(isAutoSend({ Auto: ' true ' })).toBe(true)
    expect(isAutoSend({ Auto: 'FALSE' })).toBe(false)
    expect(isAutoSend({})).toBe(false)
    expect(isAutoSend(null)).toBe(false)
  })
})

describe('summarizeDelivery', () => {
  it('counts what a run would do', () => {
    expect(summarizeDelivery([auto, manual, manual], 'auto')).toEqual({ send: 1, draft: 2 })
    expect(summarizeDelivery([auto, manual], 'send')).toEqual({ send: 2, draft: 0 })
    expect(summarizeDelivery([auto, manual], 'draft')).toEqual({ send: 0, draft: 2 })
  })
})

describe('scheduling', () => {
  const jobs = [
    { id: 'past', status: 'pending', runAt: '2026-01-01T10:00:00.000Z' },
    { id: 'future', status: 'pending', runAt: '2026-01-01T12:00:00.000Z' },
    { id: 'done', status: 'done', runAt: '2026-01-01T09:00:00.000Z' },
    { id: 'cancelled', status: 'cancelled', runAt: '2026-01-01T09:00:00.000Z' },
  ]
  const now = new Date('2026-01-01T11:00:00.000Z')

  it('treats a run whose time has passed as due, so a closed app catches up', () => {
    expect(dueJobs(jobs, now).map(j => j.id)).toEqual(['past'])
  })

  it('never re-runs a finished or cancelled job', () => {
    expect(dueJobs(jobs, new Date('2026-02-01T00:00:00.000Z')).map(j => j.id)).toEqual(['past', 'future'])
  })

  it('lists pending jobs soonest first', () => {
    expect(pendingJobs([jobs[1], jobs[0], jobs[2]]).map(j => j.id)).toEqual(['past', 'future'])
  })

  it('reads a datetime-local value as local wall-clock time', () => {
    const d = parseLocalDateTime('2026-03-04T17:30')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getHours()).toBe(17)
    expect(d.getMinutes()).toBe(30)
    expect(parseLocalDateTime('')).toBeNull()
    expect(parseLocalDateTime('not a date')).toBeNull()
  })

  it('defaults to a round time an hour out, never in the past', () => {
    const now2 = new Date(2026, 2, 4, 17, 32, 11)
    const value = defaultScheduleValue(now2)
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    const parsed = parseLocalDateTime(value)
    expect(parsed.getTime()).toBeGreaterThan(now2.getTime())
    expect(parsed.getMinutes() % 5).toBe(0)
  })
})
