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

// Pull the video id out of the URL forms YouTube actually hands out. Returns
// null for anything else, including Vimeo — supporting one host well beats
// half-supporting several.
export function youtubeId(url) {
  const raw = String(url || '').trim()
  if (!raw) return null
  let u
  try {
    u = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
  } catch {
    return null
  }
  const host = u.hostname.replace(/^www\./, '')
  const isId = v => /^[\w-]{11}$/.test(v || '')

  if (host === 'youtu.be') {
    const id = u.pathname.split('/').filter(Boolean)[0]
    return isId(id) ? id : null
  }
  if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'youtube-nocookie.com') return null

  const v = u.searchParams.get('v')
  if (isId(v)) return v

  const parts = u.pathname.split('/').filter(Boolean)
  if (['shorts', 'embed', 'v', 'live'].includes(parts[0]) && isId(parts[1])) return parts[1]
  return null
}

// Downloads a YouTube thumbnail and hands the raw bytes back. It is deliberately
// NOT saved here: the renderer may still draw a play badge onto it, and saving
// both versions would leave an orphan in the asset store. The renderer uploads
// the final image through templates:saveAsset like any other inline picture.
// The download runs in main because the renderer's CSP forbids remote fetches.
export async function fetchVideoThumb(url, fetchImpl = fetch) {
  const id = youtubeId(url)
  if (!id) throw new Error('Only YouTube links are supported right now.')

  // Best-effort title for the link label; a failure here is not fatal.
  let title = ''
  try {
    const res = await fetchImpl(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`)
    if (res.ok) title = String((await res.json())?.title || '')
  } catch { /* keep the default label */ }

  // maxres does not exist for older uploads; hq always does.
  let bytes = null
  for (const name of ['maxresdefault.jpg', 'hqdefault.jpg']) {
    try {
      const res = await fetchImpl(`https://i.ytimg.com/vi/${id}/${name}`)
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > 0 && buf.length <= MAX_ASSET_BYTES) { bytes = buf; break }
    } catch { /* try the next size */ }
  }
  if (!bytes) throw new Error('Could not download a thumbnail for that video.')

  return {
    // A plain array survives the structured clone across the IPC bridge.
    data: new Uint8Array(bytes),
    mime: 'image/jpeg',
    videoUrl: `https://www.youtube.com/watch?v=${id}`,
    title,
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

  ipcMain.handle('templates:fetchVideoThumb', (_e, url) => fetchVideoThumb(url))
}

// Used by Phase 6 when building the MIME: cid asset id → file on disk.
export function assetPath(assetId) {
  const name = String(assetId || '')
  if (!name || name.includes('/') || name.includes('..')) return null
  const path = join(assetsDir(), name)
  return existsSync(path) ? path : null
}
