// German definite articles for venue names.
//
// Two things decide the word, and only one of them is about the venue:
//
//   gender — "die Fabrik", "das Kulturzentrum", "der Hof". A property of the
//            name itself, context-free, and the genuinely hard part. Resolved
//            once per venue by the on-device model and cached forever.
//   case   — decided by the words *around* the placeholder, not by the venue:
//            "in der Fabrik" (dative) but "für die Fabrik" (accusative) and
//            "wegen der Fabrik" (genitive). Same venue, same gender.
//
// Case is a closed system — the set of prepositions is finite and their cases are
// fixed — so it belongs here as rules, where it can be tested, rather than in a
// model prompt where it cannot.

export const GENDERS = ['m', 'f', 'n', 'pl']

// gender → case → article.
const TABLE = {
  m:  { nom: 'der', acc: 'den', dat: 'dem', gen: 'des' },
  f:  { nom: 'die', acc: 'die', dat: 'der', gen: 'der' },
  n:  { nom: 'das', acc: 'das', dat: 'dem', gen: 'des' },
  pl: { nom: 'die', acc: 'die', dat: 'den', gen: 'der' },
}

export function articleFor(gender, grammaticalCase = 'nom') {
  const row = TABLE[gender] || TABLE.n
  return row[grammaticalCase] || row.nom
}

const DATIVE_ONLY = ['aus', 'außer', 'bei', 'entgegen', 'gegenüber', 'gemäß', 'mit', 'nach', 'seit', 'von', 'zu']
const ACCUSATIVE_ONLY = ['bis', 'durch', 'für', 'gegen', 'ohne', 'um', 'wider']
const GENITIVE = ['während', 'wegen', 'trotz', 'statt', 'anstatt', 'innerhalb', 'außerhalb', 'aufgrund', 'mittels', 'unweit']
// Wechselpräpositionen: dative for a location, accusative for movement toward one.
const TWO_WAY = ['an', 'auf', 'hinter', 'in', 'neben', 'über', 'unter', 'vor', 'zwischen']

// Verbs of motion, which flip a two-way preposition to the accusative:
// "wir spielen in der Fabrik" vs. "wir kommen in die Fabrik".
const MOTION = /^(komm|kämen|fahr|führen|geh|ging|reis|zieh|zög|bring|brächt|schick|flieg|lauf)/i

export function prepositionCase(word, { motion = false } = {}) {
  const w = String(word || '').toLowerCase()
  if (!w) return null
  if (DATIVE_ONLY.includes(w)) return 'dat'
  if (ACCUSATIVE_ONLY.includes(w)) return 'acc'
  if (GENITIVE.includes(w)) return 'gen'
  // Location is overwhelmingly what a booking email talks about, so a two-way
  // preposition defaults to the dative unless a verb of motion says otherwise.
  if (TWO_WAY.includes(w)) return motion ? 'acc' : 'dat'
  return null
}

// Obligatory contractions in standard written German. The colloquial ones
// (fürs, aufs, ums, vorm…) are deliberately left out: this writes business mail.
const CONTRACTIONS = {
  'an|dem': 'am', 'an|das': 'ans',
  'bei|dem': 'beim',
  'in|dem': 'im', 'in|das': 'ins',
  'von|dem': 'vom',
  'zu|dem': 'zum', 'zu|der': 'zur',
}

export function contract(preposition, article) {
  const key = `${String(preposition || '').toLowerCase()}|${article}`
  return CONTRACTIONS[key] || null
}

// Does a verb of motion appear in the few words before the placeholder?
export function hasMotionCue(precedingText, lookback = 6) {
  const words = String(precedingText || '').trim().split(/\s+/).filter(Boolean)
  return words.slice(-lookback).some(w => MOTION.test(w.replace(/[^\p{L}]/gu, '')))
}

const ARTICLE_PLACEHOLDER = /(?:([\p{L}]+)(\s+))?\{\{\s*article\s*\}\}/giu

// Replace every {{article}} in `text`, using the venue's gender and the words
// around each occurrence.
//
// The preceding word is captured because a preposition does double duty: it fixes
// the case, and when it sits directly in front it may merge with the article —
// "in {{article}} Kulturzentrum" has to become "im Kulturzentrum", never "in dem
// Kulturzentrum" and certainly not "in im Kulturzentrum". That is why the match
// swallows the preposition and re-emits it.
export function applyGermanArticles(text, gender) {
  const src = String(text ?? '')
  if (!src || !gender) return src

  return src.replace(ARTICLE_PLACEHOLDER, (match, before, gap, offset) => {
    const motion = hasMotionCue(src.slice(0, offset + (before ? before.length : 0)))
    const grammaticalCase = prepositionCase(before, { motion })
    // No preposition in front → the venue is the subject: "die Fabrik ist …".
    const article = articleFor(gender, grammaticalCase || 'nom')

    if (!before) return article
    if (!grammaticalCase) return `${before}${gap}${article}` // ordinary word, left alone

    const merged = contract(before, article)
    if (merged) {
      // Preserve the original capitalisation of the preposition, which may have
      // started the sentence.
      return before[0] === before[0].toUpperCase()
        ? merged[0].toUpperCase() + merged.slice(1)
        : merged
    }
    return `${before}${gap}${article}`
  })
}

export function hasArticlePlaceholder(text) {
  return /\{\{\s*article\s*\}\}/i.test(String(text ?? ''))
}
