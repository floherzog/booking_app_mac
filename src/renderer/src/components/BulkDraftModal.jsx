import { useState, useMemo } from 'react'
import { STATUS } from '@core/constants'
import { prepareDraft } from '../lib/drafts'

// Where a bulk run gets its venues from. Each is a filter over the rows already
// on screen, so what you see is what you draft.
const SOURCES = [
  { id: 'nextBatch', label: 'Next batch', hint: 'The venues the batch rule picked, plus anything flagged Draft.' },
  { id: 'followUp', label: 'Follow-ups due', hint: 'Every venue whose follow-up date has passed.' },
  { id: 'draftFlag', label: 'Flagged “Draft”', hint: 'Rows with TRUE in the Draft column.' },
  { id: 'filtered', label: 'Current view', hint: 'Exactly the rows your filters are showing right now.' },
]

function selectRows(source, { rows, filteredRows }) {
  switch (source) {
    case 'nextBatch': return rows.filter(r => r._nextBatch || r['Draft'] === 'TRUE')
    case 'followUp': return rows.filter(r => r._status === STATUS.FOLLOW_UP_DUE)
    case 'draftFlag': return rows.filter(r => r['Draft'] === 'TRUE')
    case 'filtered': return filteredRows
    default: return []
  }
}

export default function BulkDraftModal({ rows, filteredRows, templates, languages, settings, onDraftCreated, onClearDraftFlags, onClose }) {
  const [source, setSource] = useState('nextBatch')
  const [skipped, setSkipped] = useState(() => new Set()) // _idx the user unticked
  const [phase, setPhase] = useState('preflight') // preflight | running | done
  const [results, setResults] = useState({}) // _idx → { ok, error }
  const [current, setCurrent] = useState(null)

  // Preflight: everything that could go wrong, worked out before anything runs.
  const candidates = useMemo(() => {
    return selectRows(source, { rows, filteredRows }).map(row => ({
      row,
      prepared: prepareDraft(row, templates, languages, settings),
    }))
  }, [source, rows, filteredRows, templates, languages, settings])

  const eligible = candidates.filter(c => c.prepared.ok && !skipped.has(c.row._idx))
  const blocked = candidates.filter(c => !c.prepared.ok)

  function toggle(idx) {
    setSkipped(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  // Sequential on purpose: each draft opens its own IMAP connection, and a
  // server will throttle (or drop) a burst of parallel logins.
  async function run() {
    setPhase('running')
    const acc = {}
    for (const { row, prepared } of eligible) {
      setCurrent(row._idx)
      try {
        await window.bookingApi.appendDraft(prepared.draft)
        acc[row._idx] = { ok: true }
        onDraftCreated?.(row)
      } catch (e) {
        acc[row._idx] = { ok: false, error: e.message }
      }
      setResults({ ...acc })
    }
    setCurrent(null)
    setPhase('done')
  }

  const succeeded = Object.entries(results).filter(([, r]) => r.ok).map(([idx]) => Number(idx))
  const failed = Object.entries(results).filter(([, r]) => !r.ok)
  const succeededFlagged = succeeded.filter(idx => rows.find(r => r._idx === idx)?.['Draft'] === 'TRUE')

  const outlineBtn = 'text-sm font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-gray-400 dark:hover:border-gray-500 disabled:opacity-40 transition-colors'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1300] p-4" onClick={phase === 'running' ? undefined : onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Create drafts in Mail</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Drafts land in your Drafts mailbox. Nothing is sent, and “Last emailed” is left untouched.
            </p>
          </div>
          <button onClick={onClose} disabled={phase === 'running'} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none disabled:opacity-30">&times;</button>
        </div>

        {phase === 'preflight' && (
          <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-700">
            <div className="flex flex-wrap gap-1.5">
              {SOURCES.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setSource(s.id); setSkipped(new Set()) }}
                  title={s.hint}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${source === s.id
                    ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">{SOURCES.find(s => s.id === source)?.hint}</p>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-1.5">
          {candidates.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">No venues in this selection.</p>
          )}

          {candidates.map(({ row, prepared }) => {
            const result = results[row._idx]
            const isSkipped = skipped.has(row._idx)
            return (
              <div
                key={row._idx}
                className={`flex items-start gap-3 rounded-md border px-3 py-2 ${prepared.ok
                  ? 'border-gray-200 dark:border-gray-700'
                  : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40'}`}
              >
                {phase === 'preflight' ? (
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400 disabled:opacity-40"
                    checked={prepared.ok && !isSkipped}
                    disabled={!prepared.ok}
                    onChange={() => toggle(row._idx)}
                  />
                ) : (
                  <span className="mt-0.5 w-4 text-center text-sm shrink-0">
                    {current === row._idx ? '…' : result ? (result.ok ? <span className="text-green-600">✓</span> : <span className="text-red-600">✗</span>) : ''}
                  </span>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-100 truncate">
                    {row['Venue'] || '—'}
                    {row['City'] && <span className="text-gray-400 dark:text-gray-500"> · {row['City']}</span>}
                  </p>
                  {prepared.ok ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {row['Email']} · <span className="font-mono">{prepared.language}</span>
                      {prepared.fallbackUsed && <span className="text-amber-600 dark:text-amber-400"> · fallback language</span>}
                      {prepared.empties.length > 0 && (
                        <span className="text-amber-600 dark:text-amber-400"> · empty: {prepared.empties.join(', ')}</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500">{prepared.reason}</p>
                  )}
                  {result && !result.ok && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{result.error}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 space-y-3">
          {phase === 'done' && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-gray-700 dark:text-gray-200">
                {succeeded.length} draft{succeeded.length !== 1 ? 's' : ''} created
                {failed.length > 0 && <span className="text-red-600 dark:text-red-400"> · {failed.length} failed</span>}
              </p>
              {succeededFlagged.length > 0 && (
                <button
                  onClick={() => { onClearDraftFlags(succeededFlagged); onClose() }}
                  className={outlineBtn}
                >
                  Clear “Draft” flag on {succeededFlagged.length}
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {phase === 'preflight' && `${eligible.length} ready${blocked.length ? ` · ${blocked.length} can't be drafted` : ''}`}
              {phase === 'running' && `Creating ${Object.keys(results).length + 1} of ${eligible.length}…`}
              {phase === 'done' && 'Drafts may take a few seconds to appear in Mail.'}
            </p>
            <div className="flex gap-3 shrink-0">
              <button onClick={onClose} disabled={phase === 'running'} className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-40">
                {phase === 'done' ? 'Close' : 'Cancel'}
              </button>
              {phase !== 'done' && (
                <button
                  onClick={run}
                  disabled={phase === 'running' || eligible.length === 0}
                  className="bg-indigo-600 text-white text-sm font-medium px-5 py-2 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {phase === 'running' ? 'Creating…' : `Create ${eligible.length} draft${eligible.length !== 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
