import { formatDistanceToNow } from 'date-fns'
import { parseDate } from '@core/parseDate'

export default function RelDate({ raw, colorFn, row }) {
  const d = parseDate(raw)
  if (!d) return null
  return (
    <span className={`text-xs font-medium ${colorFn(d, row)}`}>
      {formatDistanceToNow(d, { addSuffix: true })}
    </span>
  )
}
