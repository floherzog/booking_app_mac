import { parse, isValid, format } from 'date-fns'
import { de } from 'date-fns/locale'

const FORMATS = [
  'dd.MM.yy',
  'dd.MM.yyyy',
  'd.M.yyyy',
  'd.M.yy',
  'yyyy-MM-dd',
  'dd/MM/yy',
  'MM/dd/yy',
  'MMMM yy',
  'MMMM yyyy',
  'd MMMM yyyy',
  'd. MMMM yyyy',
  'yyyy',
]

const REF = new Date(2000, 0, 1)

export function parseDate(str) {
  if (!str || typeof str !== 'string') return null
  const s = str.trim()
  if (!s) return null
  for (const fmt of FORMATS) {
    // Try English (default) then German, so month names like "Juni 2027" parse.
    for (const opts of [undefined, { locale: de }]) {
      try {
        const d = parse(s, fmt, REF, opts)
        if (isValid(d)) return d
      } catch {
        // try next format / locale
      }
    }
  }
  return null
}

export function formatDateDDMMYY(d) {
  if (!d || !isValid(d)) return ''
  return format(d, 'dd.MM.yy')
}

export function toInputValue(str) {
  const d = parseDate(str)
  if (!d) return ''
  return format(d, 'yyyy-MM-dd')
}

export function fromInputValue(str) {
  if (!str) return ''
  const [y, m, d] = str.split('-')
  return `${d}.${m}.${y.slice(2)}`
}

export function parseMonthsFromTimeFrame(str) {
  if (!str) return []
  const MONTHS = [
    'januar', 'februar', 'märz', 'april', 'mai', 'juni',
    'juli', 'august', 'september', 'oktober', 'november', 'dezember',
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ]
  const lower = str.toLowerCase()
  const found = []
  MONTHS.forEach((m, i) => {
    if (lower.includes(m)) {
      found.push(i % 12)
    }
  })
  return [...new Set(found)]
}
