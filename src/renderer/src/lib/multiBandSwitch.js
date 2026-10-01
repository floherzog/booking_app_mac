import { parseCsvText, serializeCsv } from '@core/csv'
import { emptyManifest, fileForBand, routeRows, linkVenues, mergeRows } from '@core/multiBand'
import { bandName } from '@core/bands'

// Turning multi-band mode on (split one CSV into a file per band) and off
// (merge them back). Both refuse rather than overwrite anything: the split never
// writes over an existing file, the original CSV is renamed, not deleted, and
// the band files are moved into a backup folder when merging back.

function stamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function splitPath(path) {
  const i = path.lastIndexOf('/')
  const dir = path.slice(0, i)
  const name = path.slice(i + 1)
  return { dir, name, base: name.replace(/\.csv$/i, '') }
}

const fileName = path => path.split('/').pop()

// What switching on would do, without doing it — the confirmation dialog shows
// this. → { dir, backup, files: [{ name, band, count }], manifest, routed }
export async function planSplit(settings) {
  const source = settings?.storage?.filePath
  if (settings?.storage?.adapter === 'github' || !source) {
    throw new Error('Multi-band mode needs a local CSV file (Settings ▸ Data & storage).')
  }
  const { dir, name, base } = splitPath(source)
  const { text } = await window.bookingApi.readCsvFile(source)
  const rows = await parseCsvText(text)

  // Every managed band gets a file, even one with no venues yet.
  let manifest = emptyManifest(dir, base)
  for (const b of settings.bands || []) {
    if (bandName(b).trim()) manifest = fileForBand(manifest, bandName(b)).manifest
  }
  const routed = routeRows(rows, manifest)
  const bandOf = new Map(Object.entries(routed.manifest.files).map(([band, path]) => [path, band]))
  const files = [...routed.files].map(([path, fileRows]) => ({
    path, name: fileName(path), band: bandOf.get(path) || '', count: fileRows.length,
  }))
  const backup = `${dir}/${base}.before-multiband-${stamp()}.csv`

  const clashes = []
  for (const f of [...files.map(x => x.path), backup]) {
    if (await window.bookingApi.fileExists(f)) clashes.push(fileName(f))
  }
  return { dir, source: name, backup: fileName(backup), backupPath: backup, files, clashes, manifest: routed.manifest, routed, sourcePath: source }
}

// → the new `storage` settings section.
export async function enableMultiBand(settings) {
  const plan = await planSplit(settings)
  if (plan.clashes.length) {
    throw new Error(`These files already exist in that folder: ${plan.clashes.join(', ')}. Move them away first.`)
  }
  await window.bookingApi.writeCsvFiles({
    files: [...plan.routed.files].map(([path, rows]) => ({ path, text: serializeCsv(rows), expectedMtimeMs: null })),
  })
  await window.bookingApi.moveFile({ from: plan.sourcePath, to: plan.backupPath })
  return {
    ...settings.storage,
    multiBand: { enabled: true, ...plan.manifest, sourcePath: plan.sourcePath },
  }
}

// What switching off would do. → { target, backupDir, venues, lines }
export async function planMerge(settings, rows) {
  const mb = settings.storage.multiBand
  let target = mb.sourcePath || `${mb.dir}/${mb.base}.csv`
  // Never write over a file that turned up there in the meantime.
  if (await window.bookingApi.fileExists(target)) target = `${mb.dir}/${mb.base}-merged-${stamp()}.csv`
  const backupDir = `${mb.dir}/${mb.base}-bands-backup-${stamp()}`
  const venues = new Set(rows.map(r => r._venueId)).size
  return { target, targetName: fileName(target), backupDir, backupName: fileName(backupDir), venues, lines: rows.length }
}

// `rows` are the loaded entries (no unsaved edits — the caller makes sure).
// → the new `storage` settings section.
export async function disableMultiBand(settings, rows) {
  const mb = settings.storage.multiBand
  const plan = await planMerge(settings, rows)
  const merged = mergeRows(rows[0]?._venueId ? rows : linkVenues(rows))
  await window.bookingApi.writeCsvFiles({
    files: [{ path: plan.target, text: serializeCsv(merged), expectedMtimeMs: null }],
  })
  for (const path of [mb.unassigned, ...Object.values(mb.files || {})]) {
    if (!path || !(await window.bookingApi.fileExists(path))) continue
    await window.bookingApi.moveFile({ from: path, to: `${plan.backupDir}/${fileName(path)}` })
  }
  return {
    ...settings.storage,
    adapter: 'file',
    filePath: plan.target,
    multiBand: { enabled: false, dir: '', base: '', files: {}, unassigned: '', sourcePath: '' },
  }
}
