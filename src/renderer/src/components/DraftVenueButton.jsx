import { useState, useMemo } from 'react'
import RelDate from './RelDate'
import { prepareDraft, createDraft, createDraftViaAppleScript } from '../lib/drafts'

// The per-venue draft action. The IMAP path is primary; the AppleScript one sits
// in the overflow because it drives Mail's window by keystroke and needs macOS
// permissions, so it is only ever sensible for a single draft.
export default function DraftVenueButton({ row, templates, languages, draftedAtIso, onDraftCreated }) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null) // { ok, message }
  const [overflow, setOverflow] = useState(false)

  const prepared = useMemo(
    () => prepareDraft(row, templates, languages),
    [row, templates, languages],
  )

  async function run(fn, successMessage) {
    setBusy(true)
    setStatus(null)
    setOverflow(false)
    try {
      await fn(row, templates, languages)
      setStatus({ ok: true, message: successMessage })
      onDraftCreated?.(row)
    } catch (e) {
      setStatus({ ok: false, message: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <div className="flex items-center gap-1.5">
        {prepared.ok && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            <span className="font-mono">{prepared.language}</span>
            {prepared.fallbackUsed && <span className="text-amber-600 dark:text-amber-400"> (fallback)</span>}
            {prepared.empties.length > 0 && (
              <span className="text-amber-600 dark:text-amber-400" title={`Empty: ${prepared.empties.join(', ')}`}>
                {' '}· {prepared.empties.length} empty
              </span>
            )}
          </span>
        )}

        <button
          onClick={() => run(createDraft, 'Draft created in Mail')}
          disabled={!prepared.ok || busy}
          title={prepared.ok ? 'Create a draft in your Drafts mailbox over IMAP' : prepared.reason}
          className="bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-gray-700 dark:hover:bg-white transition-colors disabled:opacity-40"
        >
          {busy ? 'Drafting…' : 'Draft in Mail'}
        </button>

        <div className="relative">
          <button
            onClick={() => setOverflow(v => !v)}
            onBlur={() => setTimeout(() => setOverflow(false), 150)}
            disabled={!prepared.ok || busy}
            title="Other ways to create this draft"
            className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-1.5 py-1.5 rounded transition-colors disabled:opacity-40"
          >
            ⋯
          </button>
          {overflow && (
            <div className="absolute right-0 bottom-full mb-1 z-10 w-64 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
              <button
                onMouseDown={e => { e.preventDefault(); run(createDraftViaAppleScript, 'Compose window opened in Mail') }}
                className="block w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <span className="block text-xs text-gray-700 dark:text-gray-200">Open in Mail.app instead</span>
                <span className="block text-[11px] text-gray-400 dark:text-gray-500">
                  No server setup, but macOS will ask for Automation and Accessibility permission.
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {!prepared.ok && (
        <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs text-right">{prepared.reason}</p>
      )}
      {status && (
        <p className={`text-xs max-w-xs text-right ${status.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {status.message}
        </p>
      )}
      {draftedAtIso && !status && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Drafted <RelDate raw={draftedAtIso} colorFn={() => 'text-gray-400'} />
        </p>
      )}
    </div>
  )
}
