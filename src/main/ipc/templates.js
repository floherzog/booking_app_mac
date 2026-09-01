import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ipcMain, app } from 'electron'

// Templates live beside the app's other state:
//   userData/templates/templates.json   the list
//   userData/templates/assets/<uuid>.<ext>   inline images and video thumbnails
// Assets are referenced from the TipTap JSON as booking-asset://<id>, which the
// booking-asset:// protocol handler serves and renderEmailHtml turns into cid:.
const ALLOWED_ASSET_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg'])
const MAX_ASSET_BYTES = 10 * 1024 * 1024

function templatesDir() {
  return join(app.getPath('userData'), 'templates')
}

function templatesFile() {
  return join(templatesDir(), 'templates.json')
}

function assetsDir() {
  return join(templatesDir(), 'assets')
}

function atomicWrite(path, data) {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  try {
    writeFileSync(tmp, data)
    renameSync(tmp, path)
  } catch (e) {
    if (existsSync(tmp)) { try { unlinkSync(tmp) } catch { /* ignore */ } }
    throw e
  }
}

function readAll() {
  try {
    const parsed = JSON.parse(readFileSync(templatesFile(), 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(list) {
  atomicWrite(templatesFile(), JSON.stringify(list, null, 2))
  return list
}

// Keep the stored shape exactly as documented, whatever the renderer sent.
function normalize(t) {
  return {
    id: t.id || randomUUID(),
    band: String(t.band || ''),
    language: String(t.language || '').trim().toLowerCase(),
    subject: String(t.subject || ''),
    bodyJSON: t.bodyJSON && typeof t.bodyJSON === 'object' ? t.bodyJSON : { type: 'doc', content: [] },
    attachments: Array.isArray(t.attachments) ? t.attachments : [],
    updatedAt: new Date().toISOString(),
  }
}

export function registerTemplatesIpc() {
  ipcMain.handle('templates:list', () => readAll())

  ipcMain.handle('templates:get', (_e, id) => readAll().find(t => t.id === id) || null)

  ipcMain.handle('templates:save', (_e, template) => {
    const saved = normalize(template)
    const list = readAll()
    const i = list.findIndex(t => t.id === saved.id)
    if (i >= 0) list[i] = saved
    else list.push(saved)
    writeAll(list)
    return saved
  })

  ipcMain.handle('templates:delete', (_e, id) => {
    writeAll(readAll().filter(t => t.id !== id))
    return true
  })

  // → { assetId, url }. `data` is a Uint8Array from the renderer's file read;
  // the id doubles as the filename so the protocol handler is a plain join.
  ipcMain.handle('templates:saveAsset', (_e, { name, data }) => {
    const bytes = Buffer.from(data)
    if (!bytes.length) throw new Error('That file is empty.')
    if (bytes.length > MAX_ASSET_BYTES) throw new Error('Images must be smaller than 10 MB.')

    const ext = extname(String(name || '')).toLowerCase()
    if (!ALLOWED_ASSET_EXT.has(ext)) {
      throw new Error(`Unsupported image type "${ext || 'unknown'}". Use PNG, JPEG, GIF, WebP, AVIF or SVG.`)
    }

    const assetId = `${randomUUID()}${ext}`
    mkdirSync(assetsDir(), { recursive: true })
    atomicWrite(join(assetsDir(), assetId), bytes)
    return { assetId, url: `booking-asset://${assetId}` }
  })
}

// Used by Phase 6 when building the MIME: cid asset id → file on disk.
export function assetPath(assetId) {
  const name = String(assetId || '')
  if (!name || name.includes('/') || name.includes('..')) return null
  const path = join(assetsDir(), name)
  return existsSync(path) ? path : null
}
