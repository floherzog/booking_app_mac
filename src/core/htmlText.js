// Kept in its own module, free of any TipTap import, so the main process can use
// it when building the plain-text part of a draft: main is externalized by
// electron-vite, and @tiptap/* is a devDependency that never ships.

// A plain-text alternative for the multipart/alternative part: block tags become
// line breaks, everything else is dropped and entities are decoded.
export function htmlToText(html) {
  return String(html || '')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
