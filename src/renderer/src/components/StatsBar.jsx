import { useMemo } from 'react'
import { STATUS_META, ACTION_STATUSES, getMissingFields } from '@core/constants'

export default function StatsBar({ rows, activeStatus, onStatusClick, actionOnly, nextBatch, missingInfo, onActionOnlyToggle, onNextBatchToggle, onMissingInfoToggle, duplicate, duplicateCount, onDuplicateToggle, autoSend, onAutoSendToggle }) {
  const counts = {}
  rows.forEach(r => { counts[r._status] = (counts[r._status] || 0) + 1 })
  // Next batch folds in manually flagged "Draft" venues (see row dots).
  const nextBatchCount = useMemo(() => rows.filter(r => r._nextBatch || r['Draft'] === 'TRUE').length, [rows])
  const autoSendCount = useMemo(() => rows.filter(r => r['Auto'] === 'TRUE').length, [rows])
  const missingCount = useMemo(() => rows.filter(r => getMissingFields(r).length > 0).length, [rows])

  const ordered = Object.entries(STATUS_META).sort((a, b) => a[1].priority - b[1].priority)
  const activeMeta = activeStatus ? STATUS_META[activeStatus] : null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        {ordered.map(([key, meta]) => {
          const count = counts[key] || 0
          if (count === 0) return null
          const active = activeStatus === key
          return (
            <button
              key={key}
              onClick={() => onStatusClick(active ? '' : key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all
                ${meta.badge}
                ${active ? 'ring-2 ring-offset-1 ring-current dark:ring-offset-gray-900' : 'hover:opacity-80'}`}
            >
              <span>{meta.label}</span>
              <span className="font-bold">{count}</span>
            </button>
          )
        })}

        {/* Divider */}
        <span className="w-px h-5 bg-gray-200 dark:bg-gray-700 self-center" />

        {/* Action needed toggle */}
        <button
          onClick={onActionOnlyToggle}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-all
            ${actionOnly
              ? 'bg-gray-800 text-white border-gray-800 dark:bg-gray-200 dark:text-gray-900 dark:border-gray-200'
              : 'bg-transparent text-gray-600 border-gray-300 hover:border-gray-400 hover:text-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:text-gray-200'
            }`}
        >
          Action needed
          <span className="font-bold text-xs">
            {rows.filter(r => ACTION_STATUSES.has(r._status)).length}
          </span>
        </button>

        {/* Next batch toggle */}
        <button
          onClick={onNextBatchToggle}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-all
            ${nextBatch
              ? 'bg-indigo-600 text-white border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500'
              : 'bg-transparent text-indigo-600 border-indigo-300 hover:border-indigo-400 hover:bg-indigo-50 dark:text-indigo-400 dark:border-indigo-800 dark:hover:border-indigo-600 dark:hover:bg-indigo-900/20'
            }`}
        >
          Next batch
          <span className="font-bold text-xs">{nextBatchCount}</span>
        </button>

        {/* Missing info toggle */}
        {missingCount > 0 && (
          <button
            onClick={onMissingInfoToggle}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-all
              ${missingInfo
                ? 'bg-orange-500 text-white border-orange-500 dark:bg-orange-500 dark:border-orange-500'
                : 'bg-transparent text-orange-600 border-orange-300 hover:border-orange-400 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-800 dark:hover:border-orange-600 dark:hover:bg-orange-900/20'
              }`}
          >
            Incomplete details
            <span className="font-bold text-xs">{missingCount}</span>
          </button>
        )}

        {/* Duplicates toggle */}
        {duplicateCount > 0 && (
          <button
            onClick={onDuplicateToggle}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-all
              ${duplicate
                ? 'bg-rose-500 text-white border-rose-500 dark:bg-rose-500 dark:border-rose-500'
                : 'bg-transparent text-rose-600 border-rose-300 hover:border-rose-400 hover:bg-rose-50 dark:text-rose-400 dark:border-rose-800 dark:hover:border-rose-600 dark:hover:bg-rose-900/20'
              }`}
          >
            Duplicates
            <span className="font-bold text-xs">{duplicateCount}</span>
          </button>
        )}

        {/* Auto send toggle */}
        {autoSendCount > 0 && (
          <button
            onClick={onAutoSendToggle}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-all
              ${autoSend
                ? 'bg-teal-600 text-white border-teal-600 dark:bg-teal-500 dark:border-teal-500'
                : 'bg-transparent text-teal-600 border-teal-300 hover:border-teal-400 hover:bg-teal-50 dark:text-teal-400 dark:border-teal-800 dark:hover:border-teal-600 dark:hover:bg-teal-900/20'
              }`}
          >
            Auto send
            <span className="font-bold text-xs">{autoSendCount}</span>
          </button>
        )}

      </div>

      {activeMeta && (
        <p className={`text-xs px-3 py-1.5 rounded-md inline-block ${activeMeta.badge} bg-opacity-60`}>
          <span className="font-medium">{activeMeta.label}:</span> {activeMeta.description}
        </p>
      )}
    </div>
  )
}
