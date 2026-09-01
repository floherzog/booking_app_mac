import Papa from 'papaparse'

// Columns the app manages but the source CSV may not have yet. Every row must
// carry these keys so Papa.unparse (which derives columns from the first row)
// always emits the headers — otherwise a flag set on a later row is dropped.
const MANAGED_COLUMNS = ['Draft', 'Auto', 'frequency', 'filler']

export function normalizeRow(row) {
  for (const col of MANAGED_COLUMNS) {
    if (!(col in row)) row[col] = ''
  }
  return row
}

// Parse an arbitrary uploaded CSV for the import wizard: auto-detect the
// delimiter (comma / semicolon / tab) and keep the source columns untouched
// (no managed-column normalization). Returns { headers, rows } so the wizard can
// offer the file's own headers for column mapping.
export function parseCsvRaw(text) {
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      delimiter: '', // let PapaParse sniff the delimiter
      skipEmptyLines: true,
      transformHeader: h => h.replace(/^\uFEFF/, '').trim(),
      complete: r => resolve({ headers: r.meta.fields || [], rows: r.data }),
      error: reject,
    })
  })
}

// Parse a semicolon-delimited booking CSV (from a file, GitHub or an upload) into
// normalized row objects. This is the interchange format shared with the webapp
// and the OpenClaw scripts — the options here are part of that contract.
export function parseCsvText(text) {
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      delimiter: ';',
      skipEmptyLines: true,
      transformHeader: h => h.replace(/^\uFEFF/, '').trim(),
      complete: r => resolve(r.data.map(normalizeRow)),
      error: reject,
    })
  })
}

export function serializeCsv(rows) {
  // Drop all internal, underscore-prefixed fields (_status, _idx, _nextBatch,
  // _missingSeverity, _health, …) so they never leak into the saved CSV.
  const clean = rows.map(r =>
    Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('_')))
  )
  return Papa.unparse(clean, { delimiter: ';', newline: '\n' })
}
