import { describe, it, expect } from 'vitest'
import { parseCsvText, parseCsvRaw, serializeCsv, normalizeRow } from '@core/csv'
import { APP_COLUMNS } from '@core/constants'

const HEADER = APP_COLUMNS.map(c => c.key).join(';')

function fullRow(n) {
  const r = {}
  APP_COLUMNS.forEach(({ key }) => { r[key] = `${key}-${n}` })
  return r
}

const FIXTURE = [
  HEADER,
  APP_COLUMNS.map(c => `${c.key}-1`).join(';'),
  APP_COLUMNS.map(c => `${c.key}-2`).join(';'),
].join('\n')

describe('CSV contract (interchange format with the webapp + OpenClaw)', () => {
  it('round-trips all 22 columns byte-for-byte', async () => {
    const rows = await parseCsvText(FIXTURE)
    expect(rows).toHaveLength(2)
    expect(serializeCsv(rows)).toBe(FIXTURE)
  })

  it('has exactly 22 app columns, in canonical order', () => {
    expect(APP_COLUMNS).toHaveLength(22)
    expect(APP_COLUMNS[0].key).toBe('Venue')
    expect(APP_COLUMNS.at(-1).key).toBe('filler')
  })

  it('is semicolon-delimited with \\n newlines', () => {
    const out = serializeCsv([fullRow(1), fullRow(2)])
    expect(out).toContain(';')
    expect(out).not.toContain('\r')
    expect(out.split('\n')).toHaveLength(3) // header + 2 rows
  })

  it('strips every _-prefixed internal field on serialize', () => {
    const out = serializeCsv([{ ...fullRow(1), _idx: 0, _status: 'SEND', _nextBatch: true, _missingSeverity: 3 }])
    expect(out.split('\n')[0]).toBe(HEADER)
    expect(out).not.toMatch(/_idx|_status|_nextBatch|_missingSeverity/)
  })

  it('strips a UTF-8 BOM from the first header', async () => {
    const rows = await parseCsvText('﻿' + FIXTURE)
    expect(Object.keys(rows[0])).toContain('Venue')
  })

  it('adds the managed columns to a row that lacks them', () => {
    const r = normalizeRow({ Venue: 'X' })
    expect(r).toMatchObject({ Draft: '', Auto: '', frequency: '', filler: '' })
  })

  it('keeps Draft/Auto as the TRUE / empty-string pair', async () => {
    const csv = 'Venue;Draft;Auto\nA;TRUE;\nB;;TRUE'
    const rows = await parseCsvText(csv)
    expect(rows[0].Draft).toBe('TRUE')
    expect(rows[0].Auto).toBe('')
    expect(rows[1].Auto).toBe('TRUE')
  })

  it('quotes values containing the delimiter, and reads them back unchanged', async () => {
    const rows = [{ Venue: 'A; B', City: 'Köln', Note: 'line1\nline2' }]
    const text = serializeCsv(rows)
    const back = await parseCsvText(text)
    expect(back[0].Venue).toBe('A; B')
    expect(back[0].City).toBe('Köln')
    expect(back[0].Note).toBe('line1\nline2')
  })

  it('parseCsvRaw sniffs a comma-delimited import file', async () => {
    const { headers, rows } = await parseCsvRaw('name,town\nClub,Berlin')
    expect(headers).toEqual(['name', 'town'])
    expect(rows[0]).toEqual({ name: 'Club', town: 'Berlin' })
  })
})
