import { useState } from 'react'
import { getAdapter } from '../lib/storageAdapters'
import { getStoredTheme, setTheme } from '../lib/theme'
import { exportCsv } from '../lib/csvFile'

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light',  label: 'Light' },
  { value: 'dark',   label: 'Dark' },
]

export default function SettingsPanel({ config, rows = [], onOpenImport, onSave, onClose }) {
  const [form, setForm] = useState(config)
  const [theme, setThemeState] = useState(getStoredTheme)
  const [newBand, setNewBand] = useState('')

  const bands = form.bands || []
  const adapter = getAdapter(config)

  function handleTheme(value) {
    setThemeState(value)
    setTheme(value)
  }

  // Persisting is App's job (one writer for settings.json) — this only reports
  // the edited form back up.
  function handleSave(e) {
    e.preventDefault()
    onSave(form)
    onClose()
  }

  // --- Data / backup ---------------------------------------------------------
  function handleExport() {
    exportCsv(rows).catch(() => { /* the user cancelled the save dialog */ })
  }

  // --- Band list -------------------------------------------------------------
  // Bands are objects: { name, tourStart, tourEnd, bookFiller }.
  function setBands(next) {
    setForm(f => ({ ...f, bands: next }))
  }

  function addBand() {
    const name = newBand.trim()
    if (!name || bands.some(b => b.name === name)) { setNewBand(''); return }
    setBands([...bands, { name, tourDates: '', bookFiller: false }]
      .sort((a, c) => a.name.localeCompare(c.name)))
    setNewBand('')
  }

  function updateBand(i, patch) {
    setBands(bands.map((b, idx) => (idx === i ? { ...b, ...patch } : b)))
  }

  function removeBand(i) {
    setBands(bands.filter((_, idx) => idx !== i))
  }

  const input = 'block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm text-sm font-mono focus:border-indigo-500 focus:ring-indigo-500'
  const lbl = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'
  const sectionLbl = 'text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3'

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[1100]" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Settings</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <p className={sectionLbl}>Storage</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {adapter.kind === 'github' ? 'GitHub' : 'Local CSV file'}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 break-all mt-0.5">{adapter.detail || adapter.label}</p>
          </div>

          <div>
            <p className={sectionLbl}>Data / Backup</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleExport}
                disabled={rows.length === 0}
                className="flex-1 py-1.5 rounded-md text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-gray-400 dark:hover:border-gray-500 disabled:opacity-40 transition-colors"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => onOpenImport?.()}
                className="flex-1 py-1.5 rounded-md text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
              >
                Import CSV…
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              Export downloads the current table. Import opens a guided wizard — replace the table or add to it,
              and match your file's columns to the app's. Changes stay in the app until you press Save.
            </p>
          </div>

          <div>
            <p className={sectionLbl}>Bands</p>
            <div className="space-y-2">
              {bands.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500">No bands yet — add one below.</p>
              )}
              {bands.map((b, i) => (
                <div key={i} className="rounded-md border border-gray-200 dark:border-gray-700 p-2 space-y-2">
                  <div className="flex gap-2 items-center">
                    <input
                      className="flex-1 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
                      value={b.name}
                      placeholder="Band name"
                      onChange={e => updateBand(i, { name: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => removeBand(i)}
                      className="shrink-0 text-gray-400 hover:text-red-600 dark:hover:text-red-400 px-2 py-1 rounded transition-colors"
                      title="Remove band"
                    >
                      &times;
                    </button>
                  </div>
                  <div className="flex gap-2 items-center">
                    <label className="text-xs text-gray-500 dark:text-gray-400 w-14 shrink-0">Touring</label>
                    <input
                      type="text"
                      className="flex-1 min-w-0 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
                      placeholder="e.g. Jun–Aug 2027, or any note"
                      value={b.tourDates}
                      onChange={e => updateBand(i, { tourDates: e.target.value })}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input
                      type="checkbox"
                      checked={b.bookFiller}
                      onChange={e => updateBand(i, { bookFiller: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
                    />
                    Book filler venues
                  </label>
                </div>
              ))}
              <div className="flex gap-2 items-center pt-1">
                <input
                  className="flex-1 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder="Add a band…"
                  value={newBand}
                  onChange={e => setNewBand(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBand() } }}
                />
                <button
                  type="button"
                  onClick={addBand}
                  className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              Band settings are stored locally. On Save, if you changed a band's touring dates or
              filler flag, you'll be asked whether to also write them onto that band's venue rows
              (the <span className="font-mono">Dates</span> / <span className="font-mono">filler</span>
              columns). Renaming only changes this list — it doesn't rewrite existing venues.
            </p>
          </div>

          <div>
            <p className={sectionLbl}>Appearance</p>
            <div className="flex gap-2">
              {THEMES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => handleTheme(t.value)}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium border transition-colors
                    ${theme === t.value
                      ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 border-gray-800 dark:border-gray-200'
                      : 'text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                    }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span />
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                Cancel
              </button>
              <button type="submit" className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors">
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
