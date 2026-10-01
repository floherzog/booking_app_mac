import { describe, it, expect } from 'vitest'
import {
  SHARED_FIELDS, venueKey, linkVenues, groupByVenue, reconcileShared,
  bandSlug, emptyManifest, fileForBand, routeRows, mergeRows,
} from '@core/multiBand'
import { parseCsvText, serializeCsv } from '@core/csv'
import { APP_COLUMNS } from '@core/constants'

function row(fields) {
  return { ...Object.fromEntries(APP_COLUMNS.map(c => [c.key, ''])), ...fields }
}

describe('venueKey', () => {
  it('ignores case and extra whitespace', () => {
    expect(venueKey({ Venue: ' Kulturfabrik  ', City: 'BERLIN' })).toBe(venueKey({ Venue: 'kulturfabrik', City: 'Berlin' }))
  })
  it('is empty for a nameless row', () => {
    expect(venueKey({ Venue: '', City: 'Berlin' })).toBe('')
  })
})

describe('linkVenues', () => {
  it('links the same venue across bands', () => {
    const linked = linkVenues([
      { Venue: 'Kulturfabrik', City: 'Berlin', Band: 'A' },
      { Venue: 'kulturfabrik', City: 'berlin', Band: 'B' },
      { Venue: 'Jazzclub', City: 'Köln', Band: 'A' },
    ])
    expect(linked[0]._venueId).toBe(linked[1]._venueId)
    expect(linked[2]._venueId).not.toBe(linked[0]._venueId)
  })

  it('never links two entries of the same band', () => {
    const linked = linkVenues([
      { Venue: 'Kulturfabrik', City: 'Berlin', Band: 'A' },
      { Venue: 'Kulturfabrik', City: 'Berlin', Band: 'a ' },
      { Venue: 'Kulturfabrik', City: 'Berlin', Band: 'B' },
    ])
    expect(linked[0]._venueId).not.toBe(linked[1]._venueId)
    // The ambiguous third entry links in order — to the first.
    expect(linked[2]._venueId).toBe(linked[0]._venueId)
  })

  it('links nothing in normal mode, without a name, or without a band', () => {
    const off = linkVenues([
      { Venue: 'Kulturfabrik', City: 'Berlin', Band: 'A' },
      { Venue: 'Kulturfabrik', City: 'Berlin', Band: 'B' },
    ], false)
    expect(off[0]._venueId).not.toBe(off[1]._venueId)
    const linked = linkVenues([
      { Venue: '', City: 'Berlin', Band: 'A' },
      { Venue: '', City: 'Berlin', Band: 'B' },
      { Venue: 'K', City: 'Berlin', Band: '' },
      { Venue: 'K', City: 'Berlin', Band: 'A' },
    ])
    expect(new Set(linked.map(r => r._venueId)).size).toBe(4)
  })
})

describe('reconcileShared', () => {
  it('makes shared fields agree, preferring the most recently emailed entry', () => {
    const rows = linkVenues([
      { _idx: 0, Venue: 'K', City: 'B', Contact: 'Old Anna', Email: 'a@k.de', 'Last emailed': '01.01.25', Band: 'A' },
      { _idx: 1, Venue: 'K', City: 'B', Contact: 'Anna Neu', Email: '', 'Last emailed': '01.06.26', Band: 'B' },
    ])
    const edits = reconcileShared(rows)
    expect(edits).toContainEqual({ _idx: 0, field: 'Contact', value: 'Anna Neu', before: 'Old Anna' })
    // An empty value never wins over a filled-in one.
    expect(edits).toContainEqual({ _idx: 1, field: 'Email', value: 'a@k.de', before: '' })
  })

  it('never touches per-band fields', () => {
    const rows = linkVenues([
      { _idx: 0, Venue: 'K', City: 'B', Note: 'one', 'Last emailed': '01.01.25', Band: 'A' },
      { _idx: 1, Venue: 'K', City: 'B', Note: 'two', 'Last emailed': '01.06.26', Band: 'B' },
    ])
    expect(reconcileShared(rows)).toEqual([])
  })

  it('covers exactly the raw venue data', () => {
    expect(SHARED_FIELDS).toEqual(['Venue', 'Type', 'City', 'Country', 'Contact', 'Email', 'Website', 'Time Frame'])
  })
})

describe('file names', () => {
  it('keeps umlauts and spaces, drops path separators', () => {
    expect(bandSlug('Die Ärzte')).toBe('Die Ärzte')
    expect(bandSlug('AC/DC: Live')).toBe('AC-DC- Live')
    expect(bandSlug('...')).toBe('band')
  })

  it('gives each band its own file, never two bands the same one', () => {
    let m = emptyManifest('/x', 'booking')
    expect(m.unassigned).toBe('/x/booking-unassigned.csv')
    const a = fileForBand(m, 'Band A'); m = a.manifest
    const b = fileForBand(m, 'band a'); m = b.manifest
    expect(a.path).toBe('/x/booking-Band A.csv')
    expect(b.path).toBe('/x/booking-band a 2.csv')
    expect(fileForBand(m, 'Band A').path).toBe(a.path)
    expect(fileForBand(m, '').path).toBe(m.unassigned)
  })

  it('does not let a band called "unassigned" take the unassigned file', () => {
    const m = emptyManifest('/x', 'booking')
    expect(fileForBand(m, 'unassigned').path).toBe('/x/booking-unassigned 2.csv')
  })
})

describe('routeRows / mergeRows', () => {
  it('routes by the Band column, empty band to unassigned, keeping empty files', () => {
    const m0 = { ...emptyManifest('/x', 'b'), files: { Gone: '/x/b-Gone.csv' } }
    const { files, manifest } = routeRows([
      { Venue: 'K', Band: 'A' },
      { Venue: 'J', Band: '' },
      { Venue: 'L', Band: 'A' },
    ], m0)
    expect(files.get('/x/b-A.csv').map(r => r.Venue)).toEqual(['K', 'L'])
    expect(files.get('/x/b-unassigned.csv').map(r => r.Venue)).toEqual(['J'])
    expect(files.get('/x/b-Gone.csv')).toEqual([])
    expect(manifest.files.A).toBe('/x/b-A.csv')
    expect(m0.files.A).toBeUndefined() // never mutated
  })

  it('round-trips: split, reload as linked entries, merge back to the same lines', async () => {
    const original = [
      row({ Venue: 'Kulturfabrik', City: 'Berlin', Band: 'A', Note: 'a-note' }),
      row({ Venue: 'Jazzclub', City: 'Köln', Band: '' }),
      row({ Venue: 'Kulturfabrik', City: 'Berlin', Band: 'B', 'Last emailed': '01.02.26' }),
    ]
    const text = serializeCsv(original)
    const parsed = await parseCsvText(text)
    const { files } = routeRows(parsed, emptyManifest('/x', 'booking'))

    // What the adapter does on load: read each file, tag it, link.
    const loaded = []
    for (const [path, rows] of files) {
      const back = await parseCsvText(serializeCsv(rows))
      back.forEach(r => loaded.push({ ...r, _file: path }))
    }
    const linked = linkVenues(loaded).map((r, i) => ({ ...r, _idx: i }))
    expect(groupByVenue(linked).size).toBe(2)

    const merged = serializeCsv(mergeRows(linked))
    const sortLines = t => t.trim().split('\n').slice(1).sort()
    expect(merged.split('\n')[0]).toBe(text.split('\n')[0])
    expect(sortLines(merged)).toEqual(sortLines(text))
  })
})
