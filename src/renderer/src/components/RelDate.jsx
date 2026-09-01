import { formatDistanceToNow } from 'date-fns'
import { parseDate } from '@core/parseDate'
import { useRules } from '../lib/rulesContext'

export default function RelDate({ raw, colorFn, row }) {
  // Every date color function takes (date, row, rules); passing the active rules
  // here keeps the TanStack column defs free of rule plumbing.
  const rules = useRules()
  const d = parseDate(raw)
  if (!d) return null
  return (
    <span className={`text-xs font-medium ${colorFn(d, row, rules)}`}>
      {formatDistanceToNow(d, { addSuffix: true })}
    </span>
  )
}
