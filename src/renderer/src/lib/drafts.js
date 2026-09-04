import { resolveTemplate, substituteTemplate, contactOptionsFor } from '@core/templates'
import { renderEmailHtml } from '@core/emailHtml'

// The key a created draft is logged under. Venue+City+Band identifies a venue
// row independently of its position in the CSV, so the log survives re-sorting
// and re-importing.
export function draftKey(row) {
  return `${row['Venue'] || ''}||${row['City'] || ''}||${row['Band'] || ''}`
}

export function draftedAt(settings, row) {
  return settings?.draftLog?.[draftKey(row)] || null
}

// Everything that decides whether a draft can be created, without creating one.
// Drives the preflight list and the disabled-with-a-reason buttons.
// `settings` is optional and only supplies the {{contact}} options (name style
// and the per-language fallback greeting); without it the raw Contact value is
// used, which is what the core defaults to.
export function prepareDraft(row, templates, languages, settings) {
  const email = (row['Email'] || '').trim()
  const resolved = resolveTemplate(templates, row, languages)

  // `resolved` carries its own `reason`, so it is spread first — otherwise it
  // would overwrite the more specific message below.
  if (!email) {
    return { ...resolved, ok: false, reason: 'No email address for this venue.', empties: [] }
  }
  if (!resolved.template) {
    return { ...resolved, ok: false, empties: [] }
  }

  const opts = settings ? contactOptionsFor(row, settings) : {}
  const substituted = substituteTemplate(resolved.template, row, opts)
  const { html, cids } = renderEmailHtml(substituted.bodyJSON)

  return {
    ...resolved,
    ok: true,
    empties: substituted.empties,
    draft: { to: email, subject: substituted.subject, html, cids },
  }
}

// Create the draft over IMAP. Deliberately does NOT touch 'Last emailed': a
// draft sitting in Mail is not a sent email, and treating it as one would push
// the venue out of the send list without anything having gone out.
export async function createDraft(row, templates, languages, settings) {
  const prepared = prepareDraft(row, templates, languages, settings)
  if (!prepared.ok) throw new Error(prepared.reason)
  const result = await window.bookingApi.appendDraft(prepared.draft)
  return { ...result, prepared }
}

// The AppleScript fallback: no server configuration, but it drives Mail's UI, so
// it is offered for one venue at a time only.
export async function createDraftViaAppleScript(row, templates, languages, settings) {
  const prepared = prepareDraft(row, templates, languages, settings)
  if (!prepared.ok) throw new Error(prepared.reason)
  await window.bookingApi.appleScriptDraft(prepared.draft)
  return { prepared }
}
