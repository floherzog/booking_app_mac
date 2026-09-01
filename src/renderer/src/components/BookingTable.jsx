import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import { useState, useEffect, useMemo, useRef } from 'react'
import StatusBadge from './StatusBadge'
import EditableCell from './EditableCell'
import SelectCell from './SelectCell'
import RelDate from './RelDate'
import { lastEmailedColor, followUpColor, lastPlayedColor, lastReplyColor } from '@core/dateColors'
import { ADVANCED_COLUMNS, STATUS_META, HEALTH_RANK, getMissingFields, getMissingSeverity } from '@core/constants'
import { parseDate, formatDateDDMMYY, toInputValue, fromInputValue } from '@core/parseDate'
import { parseReplyStatus, composeReplyStatus, replyHealth } from '@core/replyStatus'
import { prepareDraft } from '../lib/drafts'

// Subtle row tint per reply-health category. Categories without a tint (replied,
// not-yet-contacted) read neutral. Green (confirmed gig) wins over the rest.
const HEALTH_CLASS = {
  gig: 'bg-green-50 dark:bg-green-900/15',
  'auto-reply': 'bg-yellow-50 dark:bg-yellow-900/15',
  silent: 'bg-red-50 dark:bg-red-900/15',
}
const HEALTH_DOT = {
  gig: 'bg-green-400',
  reply: 'bg-gray-300 dark:bg-gray-600',
  none: 'bg-gray-300 dark:bg-gray-600',
  'auto-reply': 'bg-yellow-400',
  silent: 'bg-red-400',
}

// The Last Reply kind reads as a recorded fact (a tinted badge with an inbound
// icon), deliberately unlike the additive +pills of the Outreach action column.
const REPLY_BADGE = {
  reply: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  'auto-reply': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  none: 'border border-dashed border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500',
}
const REPLY_LABEL = { reply: 'replied', 'auto-reply': 'auto-reply', none: 'no reply' }
const REPLY_ICON = { reply: '↩', 'auto-reply': '⟳', none: '' }
function rowHighlight(row) {
  return HEALTH_CLASS[replyHealth(row)] || ''
}

const helper = createColumnHelper()

const SEVERITY_BADGE = {
  3: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  2: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  1: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
}

function mkEditable(field, opts = {}) {
  return helper.accessor(field, {
    ...opts,
    cell: i => {
      const { edits, onEdit } = i.table.options.meta
      return (
        <EditableCell
          value={i.row.original[field] || ''}
          rowIndex={i.row.original._idx}
          field={field}
          edits={edits}
          onEdit={onEdit}
          isDate={opts.isDate || false}
          className={opts.cellClass || 'text-sm text-gray-700'}
        />
      )
    },
  })
}

const COLUMNS = [
  helper.accessor('_missingSeverity', {
    id: '_missingSeverity',
    header: '',
    cell: () => null,
    enableSorting: true,
  }),
  helper.accessor('_status', {
    header: 'Status',
    cell: i => <StatusBadge status={i.getValue()} />,
    sortingFn: (a, b) =>
      (STATUS_META[a.original._status]?.priority ?? 9) -
      (STATUS_META[b.original._status]?.priority ?? 9),
    size: 140,
    enableSorting: true,
  }),
  helper.accessor('Venue', {
    header: 'Venue',
    cell: i => {
      const { edits } = i.table.options.meta
      const row = i.row.original
      const rowEdits = edits[row._idx] || {}
      const effective = { ...row, ...rowEdits }
      const missing = getMissingFields(effective)
      const website = effective['Website']
      const nameEl = website ? (
        <a
          href={website} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline"
        >
          {effective['Venue'] || '—'}
        </a>
      ) : (
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {effective['Venue'] || '—'}
        </span>
      )
      const draftNext = effective['Draft'] === 'TRUE'
      return (
        <div className="flex items-center gap-1.5">
          {draftNext
            ? <span title="Flagged: draft next" className="shrink-0 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-emerald-300 dark:ring-emerald-600" />
            : row._nextBatch && (
              (effective['Note'] || '').trim()
                ? <span title="In next batch, but needs an LLM note check — may be skipped" className="shrink-0 w-2 h-2 rounded-full bg-amber-500 ring-1 ring-amber-300 dark:ring-amber-600" />
                : <span title="In next OpenClaw batch" className="shrink-0 w-2 h-2 rounded-full bg-indigo-500" />
            )}
          {nameEl}
          {missing.length > 0 && (
            <span
              title={`Missing: ${missing.join(', ')}`}
              className={`flex-shrink-0 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center ${SEVERITY_BADGE[row._missingSeverity] || SEVERITY_BADGE[1]}`}
            >
              !
            </span>
          )}
        </div>
      )
    },
    sortingFn: 'alphanumeric',
  }),
  mkEditable('City', { header: 'City', cellClass: 'text-sm text-gray-600' }),
  mkEditable('Country', { header: 'Country', cellClass: 'text-sm text-gray-600' }),
  helper.accessor('Band', {
    header: 'Band',
    cell: i => {
      const { edits, onEdit, bandOptions } = i.table.options.meta
      return (
        <SelectCell
          value={i.row.original['Band'] || ''}
          rowIndex={i.row.original._idx}
          field="Band"
          edits={edits}
          onEdit={onEdit}
          options={bandOptions || []}
          className="text-sm text-gray-700 dark:text-gray-300"
        />
      )
    },
    sortingFn: 'alphanumeric',
  }),
  mkEditable('Type', { header: 'Type', cellClass: 'text-xs text-gray-500' }),
  helper.accessor('Last emailed', {
    header: 'Last Emailed',
    cell: i => {
      const { edits, onEdit } = i.table.options.meta
      const raw = edits[i.row.original._idx]?.['Last emailed'] ?? i.row.original['Last emailed'] ?? ''
      return (
        <div className="space-y-0.5">
          <EditableCell value={i.row.original['Last emailed'] || ''} rowIndex={i.row.original._idx} field="Last emailed" edits={edits} onEdit={onEdit} isDate className="text-xs text-gray-500" />
          <RelDate raw={raw} colorFn={lastEmailedColor} row={i.row.original} />
        </div>
      )
    },
    sortingFn: (a, b) => {
      const da = parseDate(a.original['Last emailed'])
      const db = parseDate(b.original['Last emailed'])
      if (!da && !db) return 0; if (!da) return 1; if (!db) return -1
      return da - db
    },
  }),
  helper.accessor('Follow Up Date', {
    header: 'Follow Up',
    cell: i => {
      const { edits, onEdit } = i.table.options.meta
      const raw = edits[i.row.original._idx]?.['Follow Up Date'] ?? i.row.original['Follow Up Date'] ?? ''
      return (
        <div className="space-y-0.5">
          <EditableCell value={i.row.original['Follow Up Date'] || ''} rowIndex={i.row.original._idx} field="Follow Up Date" edits={edits} onEdit={onEdit} isDate className="text-xs text-gray-500" />
          <RelDate raw={raw} colorFn={followUpColor} row={i.row.original} />
        </div>
      )
    },
    sortingFn: (a, b) => {
      const da = parseDate(a.original['Follow Up Date'])
      const db = parseDate(b.original['Follow Up Date'])
      if (!da && !db) return 0; if (!da) return 1; if (!db) return -1
      return da - db
    },
  }),
  mkEditable('Note', { header: 'Note', cellClass: 'text-xs text-gray-500' }),
  helper.accessor('Status', {
    header: 'Last Reply',
    cell: i => {
      const { edits, onEdit } = i.table.options.meta
      return <ReplyStatusCell rowIndex={i.row.original._idx} value={i.row.original['Status'] || ''} edits={edits} onEdit={onEdit} />
    },
    sortingFn: (a, b) => {
      const da = parseReplyStatus(a.original['Status']).date
      const db = parseReplyStatus(b.original['Status']).date
      if (!da && !db) return 0; if (!da) return 1; if (!db) return -1
      return da - db
    },
  }),
  helper.display({
    id: 'flags',
    header: 'Outreach',
    cell: i => {
      const { edits, onEdit } = i.table.options.meta
      const row = i.row.original
      const draft = (edits[row._idx]?.['Draft'] ?? row['Draft'] ?? '') === 'TRUE'
      const auto = (edits[row._idx]?.['Auto'] ?? row['Auto'] ?? '') === 'TRUE'
      return (
        <div className="flex flex-col gap-1 items-start">
          <DraftAction row={{ ...row, ...(edits[row._idx] || {}) }} meta={i.table.options.meta} />
          <FlagPill
            label="Draft" active={draft}
            activeClass="bg-emerald-500 text-white border-emerald-500"
            onToggle={() => onEdit(row._idx, 'Draft', draft ? '' : 'TRUE')}
          />
          <FlagPill
            label="Auto" active={auto}
            activeClass="bg-teal-500 text-white border-teal-500"
            onToggle={() => onEdit(row._idx, 'Auto', auto ? '' : 'TRUE')}
          />
        </div>
      )
    },
  }),
]

// Checkbox column injected at the front only in bulk-select mode. The header
// checkbox selects/clears every currently-shown (filtered) row.
// One-click draft straight from the row. Disabled (with the reason on hover)
// when the venue has no email or no template for its band and language.
function DraftAction({ row, meta }) {
  const { templates, languages, onQuickDraft, draftingIdx, draftResults } = meta
  if (!onQuickDraft) return null

  const prepared = prepareDraft(row, templates || [], languages)
  const busy = draftingIdx === row._idx
  const result = draftResults?.[row._idx]

  return (
    <button
      onClick={e => { e.stopPropagation(); onQuickDraft(row) }}
      disabled={!prepared.ok || busy}
      title={prepared.ok ? `Create a draft in Mail (${prepared.language})` : prepared.reason}
      className={`px-1.5 py-0.5 rounded border text-[11px] leading-none transition-colors disabled:opacity-30 ${
        result?.ok
          ? 'border-green-400 text-green-600 dark:text-green-400'
          : result
            ? 'border-red-400 text-red-600 dark:text-red-400'
            : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
      }`}
    >
      {busy ? '…' : result?.ok ? '✉ ✓' : result ? '✉ ✗' : '✉'}
    </button>
  )
}

const SELECT_COLUMN = helper.display({
  id: '_select',
  size: 32,
  header: ctx => {
    const { selected, onToggleAll } = ctx.table.options.meta
    const ids = ctx.table.getRowModel().rows.map(r => r.original._idx)
    const allSelected = ids.length > 0 && ids.every(i => selected?.has(i))
    return (
      <input
        type="checkbox"
        aria-label="Select all shown venues"
        checked={allSelected}
        onChange={e => onToggleAll(ids, e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400 cursor-pointer"
      />
    )
  },
  cell: i => {
    const { selected, onToggleRow } = i.table.options.meta
    const idx = i.row.original._idx
    return (
      <input
        type="checkbox"
        aria-label="Select venue"
        checked={selected?.has(idx) || false}
        onChange={() => onToggleRow(idx)}
        onClick={e => e.stopPropagation()}
        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400 cursor-pointer"
      />
    )
  },
})

// Fields that already have a dedicated column — no need to inject these.
const DISPLAYED_FIELDS = new Set(
  ['_status', 'Venue', 'City', 'Country', 'Band', 'Type', 'Last emailed', 'Follow Up Date', 'Note', 'Status']
)

const dateSortingFn = field => (a, b) => {
  const da = parseDate(a.original[field])
  const db = parseDate(b.original[field])
  if (!da && !db) return 0; if (!da) return 1; if (!db) return -1
  return da - db
}

// An editable column for a field that isn't shown by default, so the column the
// user sorts by in the advanced panel becomes visible in the table.
function buildExtraColumn(field) {
  const col = ADVANCED_COLUMNS.find(c => c.key === field)
  if (!col) return null
  if (col.type === 'date') {
    const colorFn = field === 'Last played' ? lastPlayedColor : followUpColor
    return helper.accessor(field, {
      header: col.label,
      cell: i => {
        const { edits, onEdit } = i.table.options.meta
        const raw = edits[i.row.original._idx]?.[field] ?? i.row.original[field] ?? ''
        return (
          <div className="space-y-0.5">
            <EditableCell value={i.row.original[field] || ''} rowIndex={i.row.original._idx} field={field} edits={edits} onEdit={onEdit} isDate className="text-xs text-gray-500" />
            <RelDate raw={raw} colorFn={colorFn} row={i.row.original} />
          </div>
        )
      },
      sortingFn: dateSortingFn(field),
    })
  }
  if (col.type === 'number') {
    return helper.accessor(field, {
      header: col.label,
      cell: i => <span className="text-sm text-gray-600 tabular-nums">{i.row.original[field] || '0'}</span>,
      sortingFn: (a, b) => (Number(a.original[field]) || 0) - (Number(b.original[field]) || 0),
    })
  }
  if (col.type === 'health') {
    return helper.accessor(() => '', {
      id: '_health',
      header: col.label,
      cell: i => {
        const h = replyHealth(i.row.original)
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
            <span className={`w-2.5 h-2.5 rounded-full ${HEALTH_DOT[h] || 'bg-gray-300 dark:bg-gray-600'}`} />
            {h}
          </span>
        )
      },
      sortingFn: (a, b) => (HEALTH_RANK[replyHealth(a.original)] ?? 9) - (HEALTH_RANK[replyHealth(b.original)] ?? 9),
    })
  }
  return mkEditable(field, { header: col.label, cellClass: 'text-sm text-gray-600' })
}

// Last-reply editor: the reply date (date-picker) with its countdown on top, the
// reply kind (dropdown) underneath. Both recompose the single `Status` CSV field.
// iOS-safe: the date input commits on blur only, never on per-scroll onChange.
function ReplyStatusCell({ rowIndex, value, edits, onEdit }) {
  const raw = edits[rowIndex]?.['Status'] ?? value ?? ''
  const { kind, dateStr, date } = parseReplyStatus(raw)
  const isEdited = edits[rowIndex]?.['Status'] !== undefined
  const [editingDate, setEditingDate] = useState(false)
  const [editingKind, setEditingKind] = useState(false)
  const dateRef = useRef(null)
  const kindRef = useRef(null)
  useEffect(() => { if (editingDate && dateRef.current) dateRef.current.focus() }, [editingDate])
  useEffect(() => { if (editingKind && kindRef.current) kindRef.current.focus() }, [editingKind])

  function commitDate(e) {
    setEditingDate(false)
    const formatted = fromInputValue(e.target.value)
    // Setting a date on an uncategorised row implies a real reply.
    const nextKind = kind === 'none' && formatted ? 'reply' : kind
    onEdit(rowIndex, 'Status', composeReplyStatus(nextKind, formatted))
  }
  function commitKind(e) {
    setEditingKind(false)
    onEdit(rowIndex, 'Status', composeReplyStatus(e.target.value, dateStr))
  }

  const colorFn = kind === 'auto-reply' ? () => 'text-gray-400' : lastReplyColor
  return (
    <div className={`space-y-1 min-w-[8rem] rounded px-1 -mx-1 ${isEdited ? 'bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-900/20 dark:ring-amber-700' : ''}`}>
      {editingDate ? (
        <input
          ref={dateRef}
          type="date"
          defaultValue={toInputValue(dateStr)}
          onBlur={commitDate}
          onClick={e => e.stopPropagation()}
          className="rounded border border-indigo-400 dark:border-indigo-600 bg-white dark:bg-gray-700 dark:text-gray-100 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      ) : (
        <div
          onClick={e => { e.stopPropagation(); setEditingDate(true) }}
          className="cursor-text hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-1 -mx-1"
          title="Click to set the reply date"
        >
          {date ? (
            <div className="leading-tight">
              <span className="text-xs text-gray-600 dark:text-gray-300">{formatDateDDMMYY(date)}</span>
              <div><RelDate raw={dateStr} colorFn={colorFn} /></div>
            </div>
          ) : (
            <span className="text-gray-300 dark:text-gray-600 text-xs">— set date —</span>
          )}
        </div>
      )}
      {editingKind ? (
        <select
          ref={kindRef}
          value={kind}
          onChange={commitKind}
          onBlur={() => setEditingKind(false)}
          onClick={e => e.stopPropagation()}
          className="rounded border border-indigo-400 dark:border-indigo-600 bg-white dark:bg-gray-700 dark:text-gray-100 px-1 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          <option value="none">— no reply —</option>
          <option value="reply">replied</option>
          <option value="auto-reply">auto-reply</option>
        </select>
      ) : (
        <button
          onClick={e => { e.stopPropagation(); setEditingKind(true) }}
          title="Click to change the reply type"
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap transition-colors hover:opacity-80 ${REPLY_BADGE[kind]}`}
        >
          {REPLY_ICON[kind] && <span className="leading-none">{REPLY_ICON[kind]}</span>}
          {REPLY_LABEL[kind]}
        </button>
      )}
    </div>
  )
}

function FlagPill({ label, active, activeClass, onToggle }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle() }}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors
        ${active ? activeClass : 'bg-transparent text-gray-400 border-gray-200 dark:border-gray-700 dark:text-gray-500'}`}
    >
      <span className="leading-none">{active ? '✓' : '+'}</span>{label}
    </button>
  )
}

function MobileCard({ row, edits, onVenueClick, onEdit }) {
  const r = row.original
  const rowEdits = edits[r._idx] || {}
  const effective = { ...r, ...rowEdits }
  const missing = getMissingFields(effective)
  const hasEdits = !!edits[r._idx]
  const meta = STATUS_META[r._status] || {}
  const highlight = hasEdits ? '' : rowHighlight(r)
  const draftNext = effective['Draft'] === 'TRUE'
  const autoSend = effective['Auto'] === 'TRUE'

  const lastEmailedRaw = rowEdits['Last emailed'] ?? r['Last emailed'] ?? ''
  const followUpRaw    = rowEdits['Follow Up Date'] ?? r['Follow Up Date'] ?? ''

  return (
    <div
      onClick={e => { if (e.target.closest('button, a, input')) return; onVenueClick(r._idx) }}
      className={`w-full text-left px-3 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0 active:bg-gray-100 dark:active:bg-gray-800 transition-colors cursor-pointer ${meta.row || ''} ${highlight} ${hasEdits ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {draftNext
            ? <span title="Flagged: draft next" className="shrink-0 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-emerald-300 dark:ring-emerald-600" />
            : r._nextBatch && (
              (effective['Note'] || '').trim()
                ? <span title="In next batch, but needs an LLM note check — may be skipped" className="shrink-0 w-2 h-2 rounded-full bg-amber-500 ring-1 ring-amber-300 dark:ring-amber-600" />
                : <span title="In next OpenClaw batch" className="shrink-0 w-2 h-2 rounded-full bg-indigo-500" />
            )}
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">{effective['Venue'] || '—'}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {missing.length > 0 && (
            <span title={`Missing: ${missing.join(', ')}`} className={`w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center ${SEVERITY_BADGE[getMissingSeverity(effective)] || SEVERITY_BADGE[1]}`}>!</span>
          )}
          <StatusBadge status={r._status} />
        </div>
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
        {effective['Band'] && <span className="font-medium text-gray-700 dark:text-gray-300">{effective['Band']}</span>}
        {(effective['City'] || effective['Country']) && (
          <span>{[effective['City'], effective['Country']].filter(Boolean).join(', ')}</span>
        )}
        {effective['Type'] && <span className="text-gray-400">{effective['Type']}</span>}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        {lastEmailedRaw && (
          <span className="text-xs text-gray-400">
            Emailed <RelDate raw={lastEmailedRaw} colorFn={lastEmailedColor} row={effective} />
          </span>
        )}
        {followUpRaw && (
          <span className="text-xs text-gray-400">
            Follow up <RelDate raw={followUpRaw} colorFn={followUpColor} row={effective} />
          </span>
        )}
      </div>
      {effective['Note'] && (
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 truncate">{effective['Note']}</p>
      )}
      <div className="mt-1.5 flex gap-1.5">
        <FlagPill
          label="Draft" active={draftNext}
          activeClass="bg-emerald-500 text-white border-emerald-500"
          onToggle={() => onEdit(r._idx, 'Draft', draftNext ? '' : 'TRUE')}
        />
        <FlagPill
          label="Auto" active={autoSend}
          activeClass="bg-teal-500 text-white border-teal-500"
          onToggle={() => onEdit(r._idx, 'Auto', autoSend ? '' : 'TRUE')}
        />
      </div>
    </div>
  )
}

export default function BookingTable({ rows, edits, onEdit, onVenueClick, sortBy, extraField, bandOptions, selectMode = false, selected, onToggleRow, onToggleAll, templates, languages, onQuickDraft, draftingIdx, draftResults }) {
  const [sorting, setSorting] = useState(sortBy || [{ id: '_status', desc: false }])

  useEffect(() => {
    if (sortBy) setSorting(sortBy)
  }, [JSON.stringify(sortBy)]) // eslint-disable-line react-hooks/exhaustive-deps

  const columns = useMemo(() => {
    let cols = COLUMNS
    if (extraField && !DISPLAYED_FIELDS.has(extraField)) {
      const extra = buildExtraColumn(extraField)
      if (extra) cols = [...COLUMNS.slice(0, -1), extra, COLUMNS[COLUMNS.length - 1]]
    }
    if (selectMode) cols = [SELECT_COLUMN, ...cols]
    return cols
  }, [extraField, selectMode])

  // TanStack Table returns functions the React Compiler can't memoize; that's
  // expected here and safe, so silence the compatibility hint.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnVisibility: { _missingSeverity: false } },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    meta: { edits, onEdit, onVenueClick, bandOptions, selected, onToggleRow, onToggleAll, templates, languages, onQuickDraft, draftingIdx, draftResults },
  })

  const sortedRows = table.getRowModel().rows

  return (
    <>
      {/* Mobile card list */}
      <div className="block sm:hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        {sortedRows.length === 0 ? (
          <p className="px-3 py-8 text-center text-gray-400 dark:text-gray-500 text-sm">No venues match the current filters.</p>
        ) : (
          sortedRows.map(row => (
            <MobileCard key={row.id} row={row} edits={edits} onVenueClick={onVenueClick} onEdit={onEdit} />
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th
                    key={h.id}
                    className={`px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide select-none
                      ${h.column.getCanSort() ? 'cursor-pointer hover:text-gray-800 dark:hover:text-gray-200' : ''}`}
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === 'asc' && ' ↑'}
                    {h.column.getIsSorted() === 'desc' && ' ↓'}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
            {sortedRows.map(row => {
              const meta = STATUS_META[row.original._status] || {}
              const hasRowEdits = !!edits[row.original._idx]
              const highlight = hasRowEdits ? '' : rowHighlight(row.original)
              return (
                <tr
                  key={row.id}
                  className={`cursor-pointer ${meta.row || ''} ${highlight} hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors ${hasRowEdits ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}`}
                  onClick={e => {
                    if (e.target.closest('input, textarea, button, a, select')) return
                    table.options.meta.onVenueClick(row.original._idx)
                  }}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-3 py-2 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-gray-400 dark:text-gray-500 text-sm">
                  No venues match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
