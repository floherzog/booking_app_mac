// Email templates are keyed by band × language. The venue's Country decides the
// language through the configurable country→language map; everything else falls
// back to the default language.

// The fields a template may interpolate, written as {{name}} in the subject and
// in the body's text. Lowercase on purpose — they read as prose, not columns.
export const PLACEHOLDERS = ['venue', 'contact', 'city', 'country', 'dates', 'text', 'band']

const PLACEHOLDER_FIELDS = {
  venue: 'Venue',
  contact: 'Contact',
  city: 'City',
  country: 'Country',
  dates: 'Dates',
  text: 'Text',
  band: 'Band',
}

const PLACEHOLDER_RE = /\{\{\s*([a-z]+)\s*\}\}/gi

// How {{contact}} is rendered. `contactStyle` picks how much of a known name to
// use; `contactFallbacks` supplies a per-language stand-in when the venue has no
// contact at all, so a greeting never comes out as "Hallo ,".
export const DEFAULT_TEMPLATE_OPTIONS = {
  contactStyle: 'full',            // 'full' | 'first'
  contactFallbacks: {
    en: '{{venue}} team',
    de: '{{venue}} Team',
  },
  // How a video is inserted. Both are applied at insert time — the badge is
  // drawn into the saved image, and the label choice is stored on the node — so
  // changing either never rewrites videos that are already in a template.
  video: {
    showLabel: true,               // the "▶ Title" text link under the thumbnail
    playOverlay: true,             // a play button drawn onto the thumbnail
  },
}

function norm(s) {
  return String(s || '').trim().toLowerCase()
}

// Resolve the substitution options for one venue: the name style, plus the
// fallback greeting for the language that venue's country maps to.
export function contactOptionsFor(row, settings) {
  const opts = { ...DEFAULT_TEMPLATE_OPTIONS, ...(settings?.templates || {}) }
  const fallbacks = { ...DEFAULT_TEMPLATE_OPTIONS.contactFallbacks, ...(opts.contactFallbacks || {}) }
  const language = languageForRow(row, settings?.languages)
  return {
    contactStyle: opts.contactStyle === 'first' ? 'first' : 'full',
    contactFallback: fallbacks[language] ?? fallbacks[norm(settings?.languages?.default) || 'en'] ?? '',
  }
}

// "Anna Müller" → "Anna". Names with a comma ("Müller, Anna") are read as
// surname-first, which is how the CSV occasionally records them.
export function firstNameOf(full) {
  const value = String(full || '').trim()
  if (!value) return ''
  if (value.includes(',')) {
    const after = value.split(',')[1]?.trim()
    if (after) return after.split(/\s+/)[0]
  }
  return value.split(/\s+/)[0]
}

// The venue's template language: a case-insensitive match of its Country against
// the configured map, otherwise the default. Countries are matched on both sides
// normalized, so "germany", "Germany" and " Deutschland " all land correctly.
export function languageForRow(row, languages) {
  const fallback = norm(languages?.default) || 'en'
  const country = norm(row?.['Country'])
  if (!country) return fallback
  const map = languages?.map || {}
  for (const [name, lang] of Object.entries(map)) {
    if (norm(name) === country) return norm(lang) || fallback
  }
  return fallback
}

// Pick the template for a venue:
//   band + its country's language  →  band + the default language  →  none.
// Always reports which language was used and whether that was a fallback, so the
// UI can warn before a draft goes out in the wrong language.
export function resolveTemplate(templates, row, languages) {
  const band = row?.['Band'] || ''
  const language = languageForRow(row, languages)
  const defaultLanguage = norm(languages?.default) || 'en'
  const list = templates || []

  if (!band) {
    return { template: null, language, fallbackUsed: false, reason: 'This venue has no band set.' }
  }

  const forBand = list.filter(t => t.band === band)
  if (forBand.length === 0) {
    return { template: null, language, fallbackUsed: false, reason: `No templates for "${band}" yet.` }
  }

  const exact = forBand.find(t => norm(t.language) === language)
  if (exact) return { template: exact, language, fallbackUsed: false, reason: '' }

  const fallback = forBand.find(t => norm(t.language) === defaultLanguage)
  if (fallback) {
    return {
      template: fallback,
      language: defaultLanguage,
      fallbackUsed: true,
      reason: `No "${language}" template for ${band} — using "${defaultLanguage}".`,
    }
  }

  return {
    template: null,
    language,
    fallbackUsed: false,
    reason: `No "${language}" or "${defaultLanguage}" template for ${band}.`,
  }
}

// Replace {{placeholders}} with the venue's values. A missing or blank field
// becomes '' rather than leaving the raw token in the email, and is reported so
// the UI can flag it before a draft is created.
//
// `opts` ({ contactStyle, contactFallback }) only affects {{contact}}. Omitting it
// keeps the plain behaviour: whatever is in the Contact column, or ''.
export function substitutePlaceholders(str, row, opts = {}) {
  const empties = new Set()
  const text = String(str ?? '').replace(PLACEHOLDER_RE, (match, rawName) => {
    const name = rawName.toLowerCase()
    const field = PLACEHOLDER_FIELDS[name]
    if (!field) return match // not one of ours — leave it alone
    const value = (row?.[field] ?? '').trim()

    if (name === 'contact') {
      if (value) return opts.contactStyle === 'first' ? firstNameOf(value) : value
      const fallback = String(opts.contactFallback || '')
      if (fallback) {
        // The fallback is itself a template ("{{venue}} Team"). Resolve it with
        // no options so a {{contact}} inside it can't recurse.
        const inner = substitutePlaceholders(fallback, row)
        inner.empties.filter(k => k !== 'contact').forEach(k => empties.add(k))
        return inner.text
      }
      empties.add(name)
      return ''
    }

    if (!value) empties.add(name)
    return value
  })
  return { text, empties: [...empties] }
}

// Substitution has to happen on the TipTap JSON's text nodes, before HTML is
// generated: a bold word inside "{{venue}}" would split the token across two
// text nodes in the rendered HTML, and a string replace would then miss it.
export function substituteDoc(doc, row, opts = {}) {
  const empties = new Set()

  // Attributes can carry placeholders too — a link href, a video URL.
  function walkAttrs(attrs) {
    if (!attrs || typeof attrs !== 'object') return attrs
    const out = {}
    for (const [k, v] of Object.entries(attrs)) {
      if (typeof v === 'string' && v.includes('{{')) {
        const { text, empties: e } = substitutePlaceholders(v, row, opts)
        out[k] = text
        e.forEach(x => empties.add(x))
      } else {
        out[k] = v
      }
    }
    return out
  }

  function walk(node) {
    if (!node || typeof node !== 'object') return node
    const next = { ...node }
    if (typeof next.text === 'string') {
      const { text, empties: e } = substitutePlaceholders(next.text, row, opts)
      next.text = text
      e.forEach(k => empties.add(k))
    }
    if (next.attrs) next.attrs = walkAttrs(next.attrs)
    // A link's href lives on the mark, not the node.
    if (Array.isArray(next.marks)) {
      next.marks = next.marks.map(m => (m?.attrs ? { ...m, attrs: walkAttrs(m.attrs) } : m))
    }
    if (Array.isArray(next.content)) next.content = next.content.map(walk)
    return next
  }

  return { doc: walk(doc), empties: [...empties] }
}

// Subject + body for one venue, with the union of everything that came back empty.
export function substituteTemplate(template, row, opts = {}) {
  const subject = substitutePlaceholders(template?.subject || '', row, opts)
  const body = substituteDoc(template?.bodyJSON || null, row, opts)
  return {
    subject: subject.text,
    bodyJSON: body.doc,
    empties: [...new Set([...subject.empties, ...body.empties])],
  }
}
