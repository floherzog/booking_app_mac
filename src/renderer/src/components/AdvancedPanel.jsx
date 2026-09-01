import { useMemo } from 'react'
import { ADVANCED_COLUMNS, STATUS_META, HEALTH_OPTIONS } from '@core/constants'

const sel = 'rounded-md border-gray-300 dark:border-gray-600 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 dark:text-gray-100'

// Classified-status options, ordered by the same priority as the badges.
const STATUS_OPTIONS = Object.entries(STATUS_META)
  .sort((a, b) => a[1].priority - b[1].priority)
  .map(([key, meta]) => ({ key, label: meta.label }))

// Field dropdowns list columns alphabetically by label.
const SORTED_COLUMNS = [...ADVANCED_COLUMNS].sort((a, b) => a.label.localeCompare(b.label))

export default function AdvancedPanel({ rows, filters, onChange }) {
  const advanced = filters.advanced || []
  const sort = filters.sort || { field: '', dir: 'asc' }

  // Distinct non-empty values per text column, for autocomplete datalists.
  const distinct = useMemo(() => {
    const map = {}
    ADVANCED_COLUMNS.forEach(c => {
      if (c.key === '_status' || c.type === 'health' || c.type === 'date') return
      const set = new Set()
      for (const r of rows) {
        const v = (r[c.key] || '').trim()
        if (v) set.add(v)
      }
      map[c.key] = [...set].sort((a, b) => a.localeCompare(b)).slice(0, 300)
    })
    return map
  }, [rows])

  const setAdvanced = next => onChange({ ...filters, advanced: next })
  const updateRule = (i, patch) => setAdvanced(advanced.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const addRule = () => setAdvanced([...advanced, { field: 'Contact', value: '' }])
  const removeRule = i => setAdvanced(advanced.filter((_, j) => j !== i))
  const setSort = patch => onChange({ ...filters, sort: { ...sort, ...patch } })

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 p-3 space-y-3">
      {/* Sort */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-14 shrink-0">Sort by</span>
        <select className={sel} value={sort.field} onChange={e => setSort({ field: e.target.value })}>
          <option value="">— None (default) —</option>
          {SORTED_COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <div className={`flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden text-xs ${sort.field ? '' : 'opacity-40 pointer-events-none'}`}>
          {['asc', 'desc'].map(dir => (
            <button
              key={dir}
              onClick={() => setSort({ dir })}
              className={`px-2.5 py-1.5 transition-colors ${sort.dir === dir
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}
            >
              {dir === 'asc' ? '↑ Asc' : '↓ Desc'}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-100 dark:border-gray-700" />

      {/* Column filters */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Filters (all must match)</span>
          <button
            onClick={addRule}
            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
          >
            + Add filter
          </button>
        </div>

        {advanced.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500">No column filters — add one to narrow by any field (status, contact, time frame, …).</p>
        )}

        {advanced.map((rule, i) => (
          <div key={i} className="flex gap-2 items-center">
            <select
              className={`${sel} w-40 shrink-0`}
              value={rule.field}
              onChange={e => updateRule(i, { field: e.target.value, value: '' })}
            >
              {SORTED_COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <ValueInput rule={rule} distinct={distinct} onValue={v => updateRule(i, { value: v })} />
            <button
              onClick={() => removeRule(i)}
              className="shrink-0 text-gray-400 hover:text-red-600 dark:hover:text-red-400 text-lg leading-none px-1"
              title="Remove filter"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ValueInput({ rule, distinct, onValue }) {
  if (rule.field === '_status') {
    return (
      <select className={`${sel} flex-1 min-w-0`} value={rule.value} onChange={e => onValue(e.target.value)}>
        <option value="">Any status</option>
        {STATUS_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    )
  }
  if (rule.field === '_health') {
    return (
      <select className={`${sel} flex-1 min-w-0`} value={rule.value} onChange={e => onValue(e.target.value)}>
        <option value="">Any reply health</option>
        {HEALTH_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    )
  }
  const col = ADVANCED_COLUMNS.find(c => c.key === rule.field)
  const opts = distinct[rule.field] || []
  const listId = `adv-${rule.field}`
  return (
    <>
      <input
        className={`${sel} flex-1 min-w-0`}
        value={rule.value}
        onChange={e => onValue(e.target.value)}
        placeholder={col?.type === 'date' ? 'contains… (e.g. 2026)' : 'contains…'}
        list={opts.length ? listId : undefined}
      />
      {opts.length > 0 && (
        <datalist id={listId}>{opts.map(o => <option key={o} value={o} />)}</datalist>
      )}
    </>
  )
}
