import { useState } from 'react'

// Dropdown table cell that renders cleanly in every browser and opens on a
// single click. The value is shown as plain text (a styled <select> paints its
// text scrambled inside table cells in Safari), with a transparent native
// <select> overlaid on top to handle interaction — so the browser's own control
// opens the picker on the first click, no showPicker() needed. Options are
// populated lazily (only on mousedown/focus of this cell, shed on blur): a full
// <option> list in every row would be tens of thousands of nodes and freeze the
// page. React flushes the discrete mousedown synchronously, so the options are
// in the DOM before the native popup opens. The row's current value stays
// selectable even if it isn't in `options`.
export default function SelectCell({ value, rowIndex, field, edits, onEdit, options = [], className = '' }) {
  const edited = edits[rowIndex]?.[field]
  const rawValue = edited !== undefined ? edited : (value || '')
  const isEdited = edited !== undefined
  const [loaded, setLoaded] = useState(false)
  const opts = loaded ? options.filter(Boolean) : []

  const highlight = isEdited
    ? 'bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-900/20 dark:ring-amber-700'
    : 'hover:bg-gray-100 dark:hover:bg-gray-700'

  return (
    <div className={`relative rounded px-1 -mx-1 transition-colors ${highlight}`} title="Click to change band">
      <div className={`truncate max-w-[11rem] ${className}`}>
        {rawValue || <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
      </div>
      <select
        value={rawValue}
        aria-label="Band"
        onMouseDown={() => setLoaded(true)}
        onFocus={() => setLoaded(true)}
        onKeyDown={() => setLoaded(true)}
        onBlur={() => setLoaded(false)}
        onChange={e => onEdit(rowIndex, field, e.target.value)}
        onClick={e => e.stopPropagation()}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        <option value="">—</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
        {rawValue && !opts.includes(rawValue) && <option value={rawValue}>{rawValue}</option>}
      </select>
    </div>
  )
}
