import { parseCsvText, serializeCsv } from '@core/csv'

// A storage adapter is the only thing that knows where the CSV lives:
//   { kind, label, configured, load(): { rows }, save(rows, message) }
// Both adapters go through core parseCsvText/serializeCsv, so the file stays
// byte-compatible with the webapp and the OpenClaw scripts either way.

function fileAdapter(storage) {
  const path = storage.filePath
  // Conflict guard: remember the mtime we read, refuse to write over a newer one.
  let loadedMtimeMs = null

  return {
    kind: 'file',
    label: path ? path.split('/').pop() : 'no file chosen',
    detail: path,
    configured: !!path,
    async load() {
      const { text, mtimeMs } = await window.bookingApi.readCsvFile(path)
      loadedMtimeMs = mtimeMs
      return { rows: await parseCsvText(text) }
    },
    async save(rows, _message, { force = false } = {}) {
      const text = serializeCsv(rows)
      const { mtimeMs } = await window.bookingApi.writeCsvFile({
        path, text, expectedMtimeMs: loadedMtimeMs, force,
      })
      loadedMtimeMs = mtimeMs
    },
  }
}

function githubAdapter(storage) {
  const { repo, path } = storage.github || {}
  let loadedSha = null

  return {
    kind: 'github',
    label: repo && path ? `${repo}/${path}` : 'GitHub not configured',
    detail: repo && path ? `${repo} · ${path}` : '',
    configured: !!(repo && path),
    async load() {
      const { text, sha } = await window.bookingApi.githubFetchCsv({ repo, path })
      loadedSha = sha
      return { rows: await parseCsvText(text) }
    },
    async save(rows, message, { force = false } = {}) {
      const text = serializeCsv(rows)
      const { sha } = await window.bookingApi.githubPushCsv({
        repo, path, text, message, expectedSha: force ? null : loadedSha,
      })
      loadedSha = sha ?? loadedSha
    },
  }
}

export function getAdapter(settings) {
  const storage = settings?.storage || {}
  return storage.adapter === 'github' ? githubAdapter(storage) : fileAdapter(storage)
}

// True once the chosen adapter has everything it needs to load.
export function isStorageConfigured(settings) {
  return getAdapter(settings).configured
}
