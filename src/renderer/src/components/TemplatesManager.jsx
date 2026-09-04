import { useState, useEffect, useMemo, useCallback } from 'react'
import { effectiveBandOptions } from '@core/bands'
import { listTemplates, saveTemplate, deleteTemplate } from '../lib/templates'
import TemplateEditor from './TemplateEditor'

function emptyTemplate(band, language) {
  return {
    band: band || '',
    language: language || 'en',
    subject: '',
    bodyJSON: { type: 'doc', content: [{ type: 'paragraph' }] },
    attachments: [],
  }
}

// One row per template, grouped by band, with the language as a chip.
export default function TemplatesManager({ settings, rows = [], onClose }) {
  const [templates, setTemplates] = useState([])
  const [editing, setEditing] = useState(null) // a template object, or null
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const languages = settings?.languages || { default: 'en', map: {} }
  // The union of managed bands and bands already present in the CSV, so a
  // template can always be written for a band that exists on a venue.
  const bandOptions = useMemo(() => effectiveBandOptions(rows, settings?.bands), [rows, settings])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setTemplates(await listTemplates())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const grouped = useMemo(() => {
    const byBand = new Map()
    for (const t of templates) {
      const key = t.band || '(no band)'
      if (!byBand.has(key)) byBand.set(key, [])
      byBand.get(key).push(t)
    }
    return [...byBand.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([band, list]) => [band, list.sort((a, b) => a.language.localeCompare(b.language))])
  }, [templates])

  async function handleSave(template) {
    await saveTemplate(template)
    await refresh()
    setEditing(null)
  }

  async function handleDelete(id) {
    try {
      await deleteTemplate(id)
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setConfirmDelete(null)
    }
  }

  // A duplicate drops the id so saving creates a new record, and clears the
  // language so the copy doesn't collide with its original.
  function duplicate(t) {
    const { id, updatedAt, ...rest } = t
    setEditing({ ...rest, language: '' })
  }

  const outlineBtn = 'text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500 transition-colors'

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[1200] p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {editing ? (editing.id ? 'Edit template' : 'New template') : 'Email templates'}
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {editing
                ? 'Fields in double braces are filled in per venue when a draft is created.'
                : `One per band and language — a venue's Country picks the language.`}
            </p>
          </div>
          <button onClick={editing ? () => setEditing(null) : onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">
            &times;
          </button>
        </div>

        {editing ? (
          <TemplateEditor
            key={editing.id || 'new'}
            template={editing}
            bandOptions={bandOptions}
            languages={languages}
            settings={settings}
            rows={rows}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
              {loading && <p className="text-sm text-gray-400 dark:text-gray-500">Loading…</p>}

              {!loading && templates.length === 0 && (
                <div className="text-center py-10">
                  <p className="text-sm text-gray-500 dark:text-gray-400">No templates yet.</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Write one per band and language — German venues get the <span className="font-mono">de</span> template,
                    everyone else the default.
                  </p>
                </div>
              )}

              {grouped.map(([band, list]) => (
                <div key={band}>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{band}</p>
                  <div className="space-y-1.5">
                    {list.map(t => (
                      <div key={t.id} className="flex items-center gap-3 rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2">
                        <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[11px] font-mono bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                          {t.language || '—'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 dark:text-gray-100 truncate">
                            {t.subject || <span className="italic text-gray-400">no subject</span>}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            edited {new Date(t.updatedAt).toLocaleDateString()}
                          </p>
                        </div>
                        {confirmDelete === t.id ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-xs text-red-700 dark:text-red-400">Delete?</span>
                            <button onClick={() => handleDelete(t.id)} className="text-xs font-semibold text-red-700 dark:text-red-400 hover:text-red-900">Yes</button>
                            <span className="text-red-300">·</span>
                            <button onClick={() => setConfirmDelete(null)} className="text-xs text-red-500 hover:text-red-700">No</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button onClick={() => setEditing(t)} className={outlineBtn}>Edit</button>
                            <button onClick={() => duplicate(t)} className={outlineBtn}>Duplicate</button>
                            <button
                              onClick={() => setConfirmDelete(t.id)}
                              className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 px-1.5 py-1 rounded transition-colors"
                              title="Delete template"
                            >
                              &times;
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
              <p className="text-xs text-red-600 dark:text-red-400 min-h-[1rem]">{error}</p>
              <div className="flex gap-3 shrink-0">
                <button onClick={onClose} className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">Close</button>
                <button
                  onClick={() => setEditing(emptyTemplate(bandOptions[0], languages.default))}
                  className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors"
                >
                  New template
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
