import { generateHTML } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { VideoLink } from './videoLink.js'

// Re-exported for convenience; it lives apart so the main process can use it
// without dragging TipTap in (see core/htmlText.js).
export { htmlToText } from './htmlText.js'

// One extension set for the editor and for rendering, so what you type is what
// the email contains. StarterKit v3 already ships Link and Underline.
export const EMAIL_EXTENSIONS = [
  StarterKit.configure({
    link: { openOnClick: false, autolink: true },
  }),
  Image,
  VideoLink,
]

// Mail clients strip <style> blocks and ignore classes, so every rule an email
// needs has to be an inline attribute.
export const EMAIL_BODY_STYLE = 'margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827'
const P_STYLE = 'margin:0 0 12px 0'
const A_STYLE = 'color:#4f46e5;text-decoration:underline'
const IMG_STYLE = 'max-width:100%;height:auto;display:block'
const VIDEO_LABEL_STYLE = 'display:inline-block;margin-top:6px;color:#4f46e5;text-decoration:underline'

// Add a style attribute to a tag that has none, or prepend to an existing one so
// author styling still wins.
function addStyle(tag, style) {
  if (/\sstyle="/.test(tag)) {
    return tag.replace(/\sstyle="/, ` style="${style};`)
  }
  return tag.replace(/^<(\w+)/, `<$1 style="${style}"`)
}

// bodyJSON (already placeholder-substituted) → an email-ready HTML document plus
// the inline assets it references. Each booking-asset://<id> becomes cid:asset-<id>;
// the caller (main, when building the MIME) attaches the matching files.
export function renderEmailHtml(bodyJSON) {
  const doc = bodyJSON || { type: 'doc', content: [] }
  let html = generateHTML(doc, EMAIL_EXTENSIONS)

  const cids = []
  html = html.replace(/<img\b[^>]*>/g, tag => {
    const m = tag.match(/src="booking-asset:\/\/([^"]+)"/)
    let out = tag
    if (m) {
      const assetId = m[1]
      const cid = `asset-${assetId}`
      if (!cids.some(c => c.cid === cid)) cids.push({ cid, assetId })
      out = out.replace(m[0], `src="cid:${cid}"`)
    }
    return addStyle(out, IMG_STYLE)
  })

  html = html.replace(/<p\b[^>]*>/g, tag => addStyle(tag, P_STYLE))
  html = html.replace(/<a\b[^>]*>/g, tag => addStyle(tag, A_STYLE))
  html = html.replace(/<span class="booking-video-label"[^>]*>/g, tag => addStyle(tag, VIDEO_LABEL_STYLE))

  return {
    html: `<!doctype html><html><body style="${EMAIL_BODY_STYLE}">${html}</body></html>`,
    // The same markup without the document wrapper, for rendering the live
    // preview inside the app (innerHTML would drop the wrapper anyway).
    bodyHtml: html,
    cids,
  }
}
