// Thin async wrapper over the main-process template store.
export function listTemplates() {
  return window.bookingApi.listTemplates()
}

export function getTemplate(id) {
  return window.bookingApi.getTemplate(id)
}

export function saveTemplate(template) {
  return window.bookingApi.saveTemplate(template)
}

export function deleteTemplate(id) {
  return window.bookingApi.deleteTemplate(id)
}

// Read a picked File and hand the bytes to main, which writes it into
// userData/templates/assets and returns the booking-asset:// URL to embed.
export async function uploadAsset(file) {
  const buffer = await file.arrayBuffer()
  return window.bookingApi.saveTemplateAsset({ name: file.name, data: new Uint8Array(buffer) })
}

// Download a YouTube thumbnail into the asset store. Main does the fetching —
// the renderer's CSP blocks remote requests. → { assetId, url, videoUrl, title }
export function fetchVideoThumb(url) {
  return window.bookingApi.fetchVideoThumb(url)
}
