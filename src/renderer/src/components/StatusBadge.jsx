import { STATUS_META } from '@core/constants'

export default function StatusBadge({ status }) {
  const meta = STATUS_META[status]
  if (!meta) return null
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${meta.badge}`}>
      {meta.label}
    </span>
  )
}
