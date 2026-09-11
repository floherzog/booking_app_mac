import { describe, it, expect } from 'vitest'
import { looksLikeAppCsv } from '../importMap.js'
import { APP_COLUMNS } from '../constants.js'

describe('looksLikeAppCsv', () => {
  it('accepts the app\'s own canonical header row', () => {
    expect(looksLikeAppCsv(APP_COLUMNS.map(c => c.key))).toBe(true)
  })

  it('accepts a file carrying the signature columns plus extras', () => {
    expect(looksLikeAppCsv(['Venue', 'Band', 'City', 'Country', 'Email', 'Last emailed', 'Whatever'])).toBe(true)
  })

  it('rejects a foreign spreadsheet', () => {
    expect(looksLikeAppCsv(['Name', 'Ort', 'E-Mail', 'Letzter Kontakt'])).toBe(false)
  })

  it('rejects a file missing even one signature column', () => {
    expect(looksLikeAppCsv(['Venue', 'Band', 'City', 'Country', 'Email'])).toBe(false)
  })

  it('tolerates whitespace around headers', () => {
    expect(looksLikeAppCsv([' Venue ', 'Band', 'City', 'Country', 'Email', 'Last emailed'])).toBe(true)
  })

  it('rejects an empty header list', () => {
    expect(looksLikeAppCsv([])).toBe(false)
    expect(looksLikeAppCsv()).toBe(false)
  })
})
