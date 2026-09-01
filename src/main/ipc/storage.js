import { readFile, writeFile, rename, stat, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { ipcMain, dialog, BrowserWindow } from 'electron'
import { APP_COLUMNS } from '../../core/constants.js'

const CSV_FILTERS = [{ name: 'CSV', extensions: ['csv'] }]

function parentWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) || undefined
}

async function mtimeOf(path) {
  try {
    return (await stat(path)).mtimeMs
  } catch {
    return null
  }
}

// Same-directory temp + rename. Writing straight to an iCloud Drive file risks a
// partially-written CSV if the app dies mid-write; a rename is atomic.
async function atomicWrite(path, text) {
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`)
  try {
    await writeFile(tmp, text, 'utf8')
    await rename(tmp, path)
  } catch (e) {
    try { await unlink(tmp) } catch { /* ignore */ }
    throw e
  }
}

export function registerStorageIpc() {
  ipcMain.handle('dialog:pickCsvOpen', async event => {
    const r = await dialog.showOpenDialog(parentWindow(event), {
      title: 'Choose your booking CSV',
      properties: ['openFile'],
      filters: CSV_FILTERS,
    })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('dialog:pickCsvSave', async (event, defaultName) => {
    const r = await dialog.showSaveDialog(parentWindow(event), {
      title: 'Create a booking CSV',
      defaultPath: defaultName || 'booking.csv',
      filters: CSV_FILTERS,
    })
    return r.canceled ? null : r.filePath
  })

  // → { text, mtimeMs }. mtimeMs is the conflict-guard token handed back on save.
  ipcMain.handle('storage:readCsvFile', async (_e, path) => {
    const text = await readFile(path, 'utf8')
    return { text, mtimeMs: await mtimeOf(path) }
  })

  // expectedMtimeMs: the mtime the renderer last read. If the file changed under
  // us (another device via iCloud, the webapp, OpenClaw) we refuse and let the
  // UI ask the user what to do.
  ipcMain.handle('storage:writeCsvFile', async (_e, { path, text, expectedMtimeMs, force = false }) => {
    const current = await mtimeOf(path)
    if (!force && expectedMtimeMs != null && current != null && current !== expectedMtimeMs) {
      // The code is embedded in the message on purpose: Electron flattens a
      // thrown Error to its message across the IPC bridge, so a .code property
      // would not survive.
      throw new Error('CSV_CONFLICT: the file changed on disk since it was loaded.')
    }
    await atomicWrite(path, text)
    return { mtimeMs: await mtimeOf(path) }
  })

  // Export = "write a copy wherever you like", so it always asks.
  ipcMain.handle('storage:exportCsv', async (event, text, defaultName) => {
    const r = await dialog.showSaveDialog(parentWindow(event), {
      title: 'Export CSV',
      defaultPath: defaultName || 'booking.csv',
      filters: CSV_FILTERS,
    })
    if (r.canceled) return null
    await atomicWrite(r.filePath, text)
    return r.filePath
  })

  // Start a brand-new booking file: just the canonical header row.
  ipcMain.handle('storage:createCsvFile', async (_e, path) => {
    await atomicWrite(path, `${APP_COLUMNS.map(c => c.key).join(';')}\n`)
    return { mtimeMs: await mtimeOf(path) }
  })
}
