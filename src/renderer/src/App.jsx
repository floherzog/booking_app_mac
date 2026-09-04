import { useState, useEffect, useMemo, useCallback } from 'react'
import { classifyBooking } from '@core/classify'
import { getSettings, saveSettings } from './lib/config'
import { ACTION_STATUSES, getMissingFields, getMissingSeverity } from '@core/constants'
import { effectiveBandOptions, bandsFromRows, normalizeBands } from '@core/bands'
import { effectiveTypeOptions } from '@core/venueTypes'
import { computeNextBatch } from '@core/nextBatch'
import { replyHealth } from '@core/replyStatus'
import { computeDuplicates, dismissPair } from '@core/duplicates'
import { mergeRules } from '@core/rules'
import { RulesProvider } from './lib/rulesContext'
import { getAdapter, isStorageConfigured } from './lib/storageAdapters'
import FirstRun from './components/FirstRun'
import TemplatesManager from './components/TemplatesManager'
import BulkDraftModal from './components/BulkDraftModal'
import { listTemplates } from './lib/templates'
import { draftKey, draftedAt, createDraft } from './lib/drafts'
import StatsBar from './components/StatsBar'
import FilterBar from './components/FilterBar'
import BookingTable from './components/BookingTable'
import MapView from './components/MapView'
import SettingsPanel from './components/SettingsPanel'
import ImportWizard from './components/ImportWizard'
import SaveModal from './components/SaveModal'
import LogicModal from './components/LogicModal'
import VenueDetailModal from './components/VenueDetailModal'
import MergeModal from './components/MergeModal'
import BulkEditBar from './components/BulkEditBar'
import { useInlinePrompt } from './components/InlinePrompt'

const SEARCH_FIELDS = ['Venue', 'City', 'Country', 'Contact', 'Band', 'Email', 'Note', 'Status', 'Text', 'Time Frame', 'Dates']

export default function App() {
  // The whole persisted config lives in the main process (userData/settings.json);
  // null until the first settings:get resolves.
  const [settings, setSettings] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastFetched, setLastFetched] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [promptNode, ask] = useInlinePrompt()
  const [showImport, setShowImport] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showBulkDraft, setShowBulkDraft] = useState(false)
  const [templates, setTemplates] = useState([])
  // Transient per-row draft feedback for the table action.
  const [draftingIdx, setDraftingIdx] = useState(null)
  const [draftResults, setDraftResults] = useState({})
  const [showSave, setShowSave] = useState(false)
  const [showLogic, setShowLogic] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [venueDetail, setVenueDetail] = useState(null)
  const [filters, setFilters] = useState({ band: '', country: '', type: '', status: '', actionOnly: false, nextBatch: false, missingInfo: false, duplicate: false, autoSend: false, search: '', advanced: [], sort: null })
  const [edits, setEdits] = useState({})
  const [deletions, setDeletions] = useState(new Set())
  const [additions, setAdditions] = useState(new Set()) // _idx of imported/new rows (no edits of their own)
  const [dismissed, setDismissed] = useState(() => new Set())
  const [mapFocusRow, setMapFocusRow] = useState(null)
  const [mergeTarget, setMergeTarget] = useState(null) // { rowA, rowB }
  const [view, setView] = useState('list')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(new Set()) // _idx of bulk-selected rows
  // The adapter instance that actually performed the last load — it carries the
  // mtime/sha conflict-guard token that Save needs.
  const [adapter, setAdapter] = useState(null)

  const today = useMemo(() => new Date(), [])
  const rules = useMemo(() => mergeRules(settings?.rules), [settings])

  // Single writer for the settings file: persist, then adopt whatever main
  // actually stored (it re-applies defaults and merges the rules).
  const persist = useCallback(async next => {
    const saved = await saveSettings(next)
    setSettings(saved)
    return saved
  }, [])

  // Read the CSV through whichever adapter is configured, classify, and stage
  // it. A not-yet-configured adapter simply yields an empty table (FirstRun is
  // what the user sees in that case anyway).
  const load = useCallback(async (settingsOverride) => {
    const s = settingsOverride || settings
    if (!s) return
    const a = getAdapter(s)
    setAdapter(a)
    if (!a.configured) { setRows([]); return }
    setLoading(true)
    setError('')
    try {
      const activeRules = mergeRules(s.rules)
      const { rows: raw } = await a.load()
      const classified = raw.map((r, i) => ({ ...r, _idx: i, _status: classifyBooking(r, today, activeRules) }))
      const nextBatchSet = computeNextBatch(classified, today, activeRules)
      setRows(classified.map(r => ({ ...r, _nextBatch: nextBatchSet.has(r._idx), _missingSeverity: getMissingSeverity(r) })))
      setEdits({})
      setDeletions(new Set())
      setAdditions(new Set())
      setLastFetched(new Date())
      // One-time seed of the managed band list from bands already in the CSV.
      if (!s.bands || s.bands.length === 0) {
        const seeded = bandsFromRows(raw).map(name => ({ name, tourDates: '', bookFiller: false }))
        if (seeded.length) await persist({ ...s, bands: seeded })
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [today, settings, persist])

  // The macOS menu bar drives the same panels as the in-app buttons. These are
  // the only channels main is allowed to push (see the preload's allowlist).
  useEffect(() => {
    const offSettings = window.bookingApi.onMenu('menu:openSettings', () => setShowSettings(true))
    const offTemplates = window.bookingApi.onMenu('menu:openTemplates', () => setShowTemplates(true))
    return () => { offSettings(); offTemplates() }
  }, [])

  // Kick off the initial fetch once on mount. Fetching is a legitimate effect and the
  // setLoading/setRows calls inside load() are its whole purpose, so opt out of the
  // set-state-in-effect heuristic here (same rationale as the exhaustive-deps opt-out).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    getSettings().then(s => {
      setSettings(s)
      setDismissed(new Set(s.dismissedDupes || []))
      load(s)
    }).catch(e => setError(e.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshTemplates = useCallback(() => {
    listTemplates().then(setTemplates).catch(() => {})
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshTemplates()
  }, [refreshTemplates])

  // Reclassify in place whenever the rules change, so a rules edit shows up on
  // the badges and the next-batch chip immediately — no reload needed.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(prev => {
      if (prev.length === 0) return prev
      const reclassified = prev.map(r => ({ ...r, _status: classifyBooking(r, today, rules) }))
      const nextBatchSet = computeNextBatch(reclassified, today, rules)
      return reclassified.map(r => ({ ...r, _nextBatch: nextBatchSet.has(r._idx), _missingSeverity: getMissingSeverity(r) }))
    })
  }, [rules, today])

  // When a band's touring dates or filler flag change in Settings, offer to push
  // those values onto that band's venue rows (Dates / filler columns). Applied as
  // normal unsaved edits — they reach the CSV only via the existing Save flow.
  function propagateBandChanges(oldBands, newBands) {
    const oldByName = new Map((oldBands || []).map(b => [b.name, b]))
    for (const nb of newBands) {
      const ob = oldByName.get(nb.name)
      if (!ob) continue // new or renamed band — nothing to compare against
      const matching = rows.filter(r => r['Band'] === nb.name && !deletions.has(r._idx))
      if (!matching.length) continue

      if (nb.tourDates !== ob.tourDates && nb.tourDates) {
        if (window.confirm(`Set the "Dates" column for ${matching.length} "${nb.name}" venue(s) to "${nb.tourDates}"?`)) {
          matching.forEach(r => handleEdit(r._idx, 'Dates', nb.tourDates))
        }
      }

      if (nb.bookFiller !== ob.bookFiller) {
        const label = nb.bookFiller ? 'TRUE' : 'empty'
        if (window.confirm(`Set the "filler" column to ${label} for ${matching.length} "${nb.name}" venue(s)?`)) {
          matching.forEach(r => handleEdit(r._idx, 'filler', nb.bookFiller ? 'TRUE' : ''))
        }
      }
    }
  }

  async function handleSettingsSave(form) {
    const bands = normalizeBands(form.bands)
    propagateBandChanges(settings.bands, bands)
    const saved = await persist({ ...settings, ...form, bands })
    // A rules change reclassifies through the effect below; a storage change
    // means the venues themselves come from somewhere else now, so refetch.
    if (JSON.stringify(saved.storage) !== JSON.stringify(settings.storage)) await load(saved)
  }

  // A created draft is recorded in settings, never on the venue row: a draft
  // is not a sent email, so "Last emailed" must stay exactly as it was.
  const recordDraft = useCallback(async row => {
    const at = new Date().toISOString()
    setSettings(prev => (prev ? { ...prev, draftLog: { ...prev.draftLog, [draftKey(row)]: at } } : prev))
    try {
      const current = await getSettings()
      await persist({ ...current, draftLog: { ...current.draftLog, [draftKey(row)]: at } })
    } catch { /* the log is a convenience; a failed write must not break drafting */ }
  }, [persist])

  async function handleQuickDraft(row) {
    setDraftingIdx(row._idx)
    try {
      await createDraft(row, templates, settings.languages, settings)
      setDraftResults(prev => ({ ...prev, [row._idx]: { ok: true } }))
      await recordDraft(row)
    } catch (e) {
      setDraftResults(prev => ({ ...prev, [row._idx]: { ok: false, error: e.message } }))
      setError(e.message)
    } finally {
      setDraftingIdx(null)
    }
  }

  // Staged as ordinary edits so the change goes through SaveModal like any other.
  function clearDraftFlags(idxs) {
    idxs.forEach(idx => handleEdit(idx, 'Draft', ''))
  }

  function handleEdit(rowIndex, field, value) {
    // Swapping a venue's band also fills its Dates from that band's touring
    // text (only when the band has one — never wipe an existing Dates value).
    let extra = null
    if (field === 'Band' && value) {
      const band = (settings?.bands || []).find(b => b.name === value)
      if (band?.tourDates) extra = { field: 'Dates', value: band.tourDates }
    }
    setEdits(prev => {
      const rowEdits = { ...(prev[rowIndex] || {}) }
      const apply = (f, v) => {
        const original = rows[rowIndex]?.[f] ?? ''
        if (v === original) delete rowEdits[f]
        else rowEdits[f] = v
      }
      apply(field, value)
      if (extra) apply(extra.field, extra.value)
      if (Object.keys(rowEdits).length === 0) {
        const next = { ...prev }
        delete next[rowIndex]
        return next
      }
      return { ...prev, [rowIndex]: rowEdits }
    })
  }

  function handleSaveSuccess(updatedRows) {
    const reclassified = updatedRows.map(r => ({ ...r, _status: classifyBooking(r, today, rules) }))
    const nextBatchSet = computeNextBatch(reclassified, today, rules)
    setRows(reclassified.map(r => ({ ...r, _nextBatch: nextBatchSet.has(r._idx), _missingSeverity: getMissingSeverity(r) })))
    setEdits({})
    setDeletions(new Set())
    setAdditions(new Set())
    setSelected(new Set())
    setShowSave(false)
  }

  // Replace the in-memory table with rows parsed from an uploaded CSV file.
  // Nothing is pushed to GitHub until the user hits Save.
  function handleImport(importedRaw, mode = 'replace') {
    if (mode === 'add') {
      // Append imported rows as new venues with fresh _idx past the current max,
      // keeping existing rows and any unsaved edits/deletions. Track them in
      // `additions` so they show in — and enable — the Save flow.
      const nextIdx = rows.reduce((max, r) => Math.max(max, r._idx), -1) + 1
      const appended = importedRaw.map((r, i) => ({ ...r, _idx: nextIdx + i }))
      const merged = [...rows, ...appended].map(r => ({ ...r, _status: classifyBooking(r, today, rules) }))
      const nextBatchSet = computeNextBatch(merged, today, rules)
      setRows(merged.map(r => ({ ...r, _nextBatch: nextBatchSet.has(r._idx), _missingSeverity: getMissingSeverity(r) })))
      setAdditions(prev => new Set([...prev, ...appended.map(r => r._idx)]))
      return
    }
    // replace
    const classified = importedRaw.map((r, i) => ({ ...r, _idx: i, _status: classifyBooking(r, today, rules) }))
    const nextBatchSet = computeNextBatch(classified, today, rules)
    setRows(classified.map(r => ({ ...r, _nextBatch: nextBatchSet.has(r._idx), _missingSeverity: getMissingSeverity(r) })))
    setEdits({})
    setDeletions(new Set())
    setAdditions(new Set())
  }

  function handleDelete(rowIndex) {
    setDeletions(prev => new Set([...prev, rowIndex]))
    setVenueDetail(null)
  }

  // --- Bulk (multi-venue) edit -----------------------------------------------
  function toggleRowSelect(idx) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  // Select or clear all currently-filtered rows at once (header checkbox).
  function toggleAllSelect(idxs, checked) {
    setSelected(prev => {
      const next = new Set(prev)
      if (checked) idxs.forEach(i => next.add(i))
      else idxs.forEach(i => next.delete(i))
      return next
    })
  }

  // Apply one field/value to every selected row as normal unsaved edits.
  function handleBulkEdit(field, value) {
    selected.forEach(idx => handleEdit(idx, field, value))
  }

  function handleBulkDelete() {
    setDeletions(prev => new Set([...prev, ...selected]))
    setSelected(new Set())
  }

  function exitSelect() {
    setSelected(new Set())
    setSelectMode(false)
  }

  function handleDiscard() {
    // Drop imported (not-yet-saved) rows along with edits and deletions.
    if (additions.size) setRows(prev => prev.filter(r => !additions.has(r._idx)))
    setEdits({})
    setDeletions(new Set())
    setAdditions(new Set())
    setSelected(new Set())
    setConfirmDiscard(false)
  }

  function handleNewVenue() {
    const newIdx = rows.length
    const emptyRow = {
      _idx: newIdx, Venue: '', Band: '', City: '', Country: '', Email: '',
      Contact: '', Website: '', Type: '', Note: '', Status: '',
      'Last emailed': '', 'Follow Up Date': '', 'Last played': '',
      'Time Frame': '', Dates: '', Text: '', Draft: '', Auto: '', frequency: '',
      _status: classifyBooking({}, today, rules),
      _nextBatch: false,
      _missingSeverity: getMissingSeverity({}),
    }
    setRows(prev => [...prev, emptyRow])
    setVenueDetail(newIdx)
  }

  const editCount = Object.values(edits).reduce((sum, f) => sum + Object.keys(f).length, 0) + deletions.size + additions.size
  const { dups: duplicateSet, partners: duplicatePartners } = useMemo(() => computeDuplicates(rows, dismissed), [rows, dismissed])
  const bandOptions = useMemo(() => effectiveBandOptions(rows, settings?.bands), [rows, settings])
  const typeOptions = useMemo(() => effectiveTypeOptions(rows, settings?.venueTypes), [rows, settings])

  // "+ Add new…" in a Type dropdown: ask for the name, remember it in settings so
  // it is offered everywhere from now on, and hand it back to the cell to commit.
  async function handleAddType() {
    const name = (await ask({
      label: 'New venue type',
      placeholder: 'club',
      hint: 'Only "festival" and "dead" change how a venue is classified; anything else is just a label.',
      confirmLabel: 'Add',
    }))?.trim()
    if (!name) return null
    const known = settings?.venueTypes || []
    if (!known.some(t => t.toLowerCase() === name.toLowerCase())) {
      await persist({ ...settings, venueTypes: [...known, name] })
    }
    return name
  }

  function handleDismiss(r1, r2) {
    const next = dismissPair(dismissed, r1, r2)
    setDismissed(next)
    persist({ ...settings, dismissedDupes: [...next] }).catch(() => {})
  }

  function handleOpenMerge(partner) {
    const current = rows.find(r => r._idx === venueDetail)
    if (current) setMergeTarget({ rowA: current, rowB: partner })
  }

  function handleMerge(keepIdx, deleteIdx, mergedFields) {
    const keepRow = rows.find(r => r._idx === keepIdx)
    Object.entries(mergedFields).forEach(([field, value]) => {
      if ((keepRow?.[field] ?? '') !== value) handleEdit(keepIdx, field, value)
    })
    setDeletions(prev => new Set([...prev, deleteIdx]))
    setMergeTarget(null)
    setVenueDetail(null)
  }

  const filteredRows = useMemo(() => {
    const q = (filters.search || '').toLowerCase().trim()
    return rows.filter(r => {
      if (deletions.has(r._idx)) return false
      if (filters.nextBatch && !(r._nextBatch || r['Draft'] === 'TRUE')) return false
      if (filters.autoSend && r['Auto'] !== 'TRUE') return false
      if (filters.missingInfo && getMissingFields(r).length === 0) return false
      if (filters.duplicate && !duplicateSet.has(r._idx)) return false
      if (filters.actionOnly && !ACTION_STATUSES.has(r._status)) return false
      if (filters.status && r._status !== filters.status) return false
      if (filters.band && r['Band'] !== filters.band) return false
      if (filters.country && r['Country'] !== filters.country) return false
      if (filters.type && r['Type'] !== filters.type) return false
      if (q && !SEARCH_FIELDS.some(f => (r[f] || '').toLowerCase().includes(q))) return false
      for (const rule of filters.advanced || []) {
        if (!rule.field || !rule.value) continue
        if (rule.field === '_status') {
          if (r._status !== rule.value) return false
        } else if (rule.field === '_health') {
          if (replyHealth(r) !== rule.value) return false
        } else if (!String(r[rule.field] || '').toLowerCase().includes(rule.value.toLowerCase())) {
          return false
        }
      }
      return true
    })
  }, [rows, filters, deletions, duplicateSet])

  // Sorting runs through the table itself, so the sorted column stays visible
  // (BookingTable injects it as an extra column when it isn't a default one).
  const tableSortBy = filters.sort?.field
    ? [{ id: filters.sort.field, desc: filters.sort.dir === 'desc' }]
    : filters.missingInfo
      ? [{ id: '_missingSeverity', desc: true }]
      : [{ id: '_status', desc: false }]

  // Settings haven't arrived yet — nothing sensible to draw.
  if (!settings) return <div className="min-h-screen bg-gray-50 dark:bg-gray-900" />

  // No storage configured yet: point the user at a CSV before anything else.
  if (!isStorageConfigured(settings)) {
    return (
      <FirstRun
        settings={settings}
        onConfigured={async storage => {
          const saved = await persist({ ...settings, storage: { ...settings.storage, ...storage } })
          await load(saved)
        }}
      />
    )
  }

  const iconBtn = 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40'
  const viewToggleActive = 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900'
  const viewToggleInactive = 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'

  const GlobeIcon = (
    <svg className="w-[1em] h-[1em] inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  )
  const SlidersIcon = (
    <svg className="w-[1em] h-[1em] inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="7" x2="10" y2="7"/><circle cx="13" cy="7" r="2.5"/><line x1="15.5" y1="7" x2="21" y2="7"/>
      <line x1="3" y1="12" x2="6" y2="12"/><circle cx="9" cy="12" r="2.5"/><line x1="11.5" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="17" x2="16" y2="17"/><circle cx="19" cy="17" r="2.5"/>
    </svg>
  )

  // Mobile-only: icon-only vertical controls sidebar
  const mobileControls = (
    <div className="flex flex-col gap-0.5 items-stretch">
      <div className="flex flex-col rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden text-base">
        <button onClick={() => setView('list')} className={`flex items-center justify-center p-2 transition-colors ${view === 'list' ? viewToggleActive : viewToggleInactive}`}>≡</button>
        <button onClick={() => setView('map')} className={`flex items-center justify-center p-2 transition-colors border-t border-gray-200 dark:border-gray-700 ${view === 'map' ? viewToggleActive : viewToggleInactive}`}>{GlobeIcon}</button>
      </div>
      {editCount > 0 && (
        <button onClick={() => setShowSave(true)} className="flex items-center justify-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium px-2 py-1.5 rounded-md transition-colors">
          Save <span className="bg-amber-400 text-amber-900 font-bold px-1 py-0.5 rounded-full leading-none">{editCount}</span>
        </button>
      )}
      <button onClick={() => setShowBulkDraft(true)} className={iconBtn} title="Create drafts in Mail">✉</button>
      <button onClick={() => setShowLogic(true)} className={iconBtn} title="How venues are classified">ⓘ</button>
      <button onClick={() => load()} disabled={loading} className={iconBtn}>{loading ? '…' : '↻'}</button>
      <button onClick={() => setShowSettings(true)} className={iconBtn} title="Settings">{SlidersIcon}</button>
    </div>
  )

  return (
    <RulesProvider rules={rules}>
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {promptNode}
      <div className="max-w-[1700px] mx-auto px-4 py-6 space-y-5">

        {/* Desktop header — original layout */}
        <div className="hidden sm:flex items-start justify-between">
          <div>
            {lastFetched && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {rows.length} venues · fetched {lastFetched.toLocaleTimeString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden text-sm">
              <button onClick={() => setView('list')} className={`px-3 py-1.5 transition-colors ${view === 'list' ? viewToggleActive : viewToggleInactive}`}>≡ List</button>
              <button onClick={() => setView('map')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 transition-colors border-l border-gray-200 dark:border-gray-700 ${view === 'map' ? viewToggleActive : viewToggleInactive}`}>{GlobeIcon} Map</button>
            </div>
            {editCount > 0 && (
              <>
                <button onClick={() => setShowSave(true)} className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-1.5 rounded-md transition-colors">
                  <span>Save</span>
                  <span className="bg-amber-400 text-amber-900 text-xs font-bold px-1.5 py-0.5 rounded-full">{editCount}</span>
                </button>
                {confirmDiscard ? (
                  <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md px-3 py-1.5">
                    <span className="text-xs text-red-700 dark:text-red-400">Sure?</span>
                    <button onClick={handleDiscard} className="text-xs font-semibold text-red-700 dark:text-red-400 hover:text-red-900">Yes</button>
                    <span className="text-red-300">·</span>
                    <button onClick={() => setConfirmDiscard(false)} className="text-xs text-red-500 hover:text-red-700">No</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDiscard(true)} className="text-sm text-gray-400 hover:text-red-600 px-2 py-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">Discard</button>
                )}
              </>
            )}
            <button onClick={() => setShowBulkDraft(true)} className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Create drafts in Mail for several venues">✉ Drafts</button>
            <button onClick={() => setShowLogic(true)} className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="How venues are classified">ⓘ Logic</button>
            <button onClick={() => load()} disabled={loading} className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors">{loading ? 'Loading…' : '↻'}</button>
            <button onClick={() => setShowSettings(true)} className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Settings">⚙</button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3 text-sm text-red-700 dark:text-red-400">{error}</div>
        )}

        {loading && rows.length === 0 && (
          <div className="text-sm text-gray-400 dark:text-gray-500 py-12 text-center">Loading booking data…</div>
        )}

        {/* Mobile controls when no data yet */}
        {rows.length === 0 && !loading && (
          <div className="sm:hidden flex justify-end">{mobileControls}</div>
        )}

        {rows.length > 0 && (
          <>
            {/* Mobile: chips + vertical controls sidebar */}
            <div className="sm:hidden flex gap-2 items-start">
              <div className="flex-1 min-w-0">
                <StatsBar
                  rows={rows}
                  activeStatus={filters.status}
                  onStatusClick={status => setFilters(f => ({ ...f, status, actionOnly: false, nextBatch: false, autoSend: false }))}
                  actionOnly={filters.actionOnly}
                  nextBatch={filters.nextBatch}
                  onActionOnlyToggle={() => setFilters(f => ({ ...f, actionOnly: !f.actionOnly, status: '', nextBatch: false, missingInfo: false, autoSend: false }))}
                  onNextBatchToggle={() => setFilters(f => ({ ...f, nextBatch: !f.nextBatch, actionOnly: false, status: '', missingInfo: false, autoSend: false }))}
                  missingInfo={filters.missingInfo}
                  onMissingInfoToggle={() => setFilters(f => ({ ...f, missingInfo: !f.missingInfo, actionOnly: false, nextBatch: false, status: '', autoSend: false }))}
                  duplicate={filters.duplicate}
                  duplicateCount={duplicateSet.size}
                  onDuplicateToggle={() => setFilters(f => ({ ...f, duplicate: !f.duplicate, actionOnly: false, nextBatch: false, missingInfo: false, status: '', autoSend: false }))}
                  autoSend={filters.autoSend}
                  onAutoSendToggle={() => setFilters(f => ({ ...f, autoSend: !f.autoSend, actionOnly: false, nextBatch: false, missingInfo: false, duplicate: false, status: '' }))}
                />
              </div>
              <div className="shrink-0 pt-0.5">{mobileControls}</div>
            </div>

            {/* Desktop: StatsBar full width */}
            <div className="hidden sm:block">
              <StatsBar
                rows={rows}
                activeStatus={filters.status}
                onStatusClick={status => setFilters(f => ({ ...f, status, actionOnly: false, nextBatch: false, autoSend: false }))}
                actionOnly={filters.actionOnly}
                nextBatch={filters.nextBatch}
                onActionOnlyToggle={() => setFilters(f => ({ ...f, actionOnly: !f.actionOnly, status: '', nextBatch: false, missingInfo: false, autoSend: false }))}
                onNextBatchToggle={() => setFilters(f => ({ ...f, nextBatch: !f.nextBatch, actionOnly: false, status: '', missingInfo: false, autoSend: false }))}
                missingInfo={filters.missingInfo}
                onMissingInfoToggle={() => setFilters(f => ({ ...f, missingInfo: !f.missingInfo, actionOnly: false, nextBatch: false, status: '', autoSend: false }))}
                duplicate={filters.duplicate}
                duplicateCount={duplicateSet.size}
                onDuplicateToggle={() => setFilters(f => ({ ...f, duplicate: !f.duplicate, actionOnly: false, nextBatch: false, missingInfo: false, status: '', autoSend: false }))}
                autoSend={filters.autoSend}
                onAutoSendToggle={() => setFilters(f => ({ ...f, autoSend: !f.autoSend, actionOnly: false, nextBatch: false, missingInfo: false, duplicate: false, status: '' }))}
              />
            </div>

            <FilterBar rows={rows} filters={filters} onChange={setFilters} onNewVenue={handleNewVenue} bandOptions={bandOptions} typeOptions={typeOptions} />
            {view === 'list' && (
              <>
                <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-3">
                  <span>Showing {filteredRows.length} of {rows.length} venues</span>
                  {editCount > 0 && (
                    <span className="text-amber-600 dark:text-amber-400 font-medium">{editCount} unsaved edit{editCount !== 1 ? 's' : ''}</span>
                  )}
                  {/* Low-key desktop-only bulk-edit toggle */}
                  <button
                    onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
                    className="hidden sm:inline text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline decoration-dotted underline-offset-2"
                  >
                    {selectMode ? `Done${selected.size ? ` (${selected.size})` : ''}` : 'Select'}
                  </button>
                </div>
                <BookingTable
                  rows={filteredRows}
                  edits={edits}
                  onEdit={handleEdit}
                  onVenueClick={setVenueDetail}
                  sortBy={tableSortBy}
                  extraField={filters.sort?.field}
                  bandOptions={bandOptions}
                  typeOptions={typeOptions}
                  onAddType={handleAddType}
                  selectMode={selectMode}
                  selected={selected}
                  onToggleRow={toggleRowSelect}
                  onToggleAll={toggleAllSelect}
                  templates={templates}
                  languages={settings.languages}
                  settings={settings}
                  onQuickDraft={handleQuickDraft}
                  draftingIdx={draftingIdx}
                  draftResults={draftResults}
                />
              </>
            )}
            {view === 'map' && (
              <MapView
                filteredRows={filteredRows}
                onVenueClick={setVenueDetail}
                focusRow={mapFocusRow}
              />
            )}
          </>
        )}
      </div>

      {selectMode && view === 'list' && (
        <BulkEditBar
          selectedCount={selected.size}
          filteredCount={filteredRows.length}
          bandOptions={bandOptions}
          typeOptions={typeOptions}
          onSelectAllFiltered={() => toggleAllSelect(filteredRows.map(r => r._idx), true)}
          onClear={() => setSelected(new Set())}
          onBulkEdit={handleBulkEdit}
          onBulkDelete={handleBulkDelete}
          onExit={exitSelect}
        />
      )}

      {showSettings && <SettingsPanel config={settings} rows={rows} onOpenImport={() => { setShowSettings(false); setShowImport(true) }} onOpenTemplates={() => { setShowSettings(false); setShowTemplates(true) }} onSave={handleSettingsSave} onPersist={form => persist({ ...settings, ...form })} onClose={() => setShowSettings(false)} />}
      {showTemplates && <TemplatesManager settings={settings} rows={rows} onClose={() => { setShowTemplates(false); refreshTemplates() }} />}
      {showBulkDraft && (
        <BulkDraftModal
          rows={rows}
          filteredRows={filteredRows}
          templates={templates}
          languages={settings.languages}
          settings={settings}
          onDraftCreated={recordDraft}
          onClearDraftFlags={clearDraftFlags}
          onClose={() => setShowBulkDraft(false)}
        />
      )}
      {showImport && <ImportWizard rows={rows} onImport={handleImport} onClose={() => setShowImport(false)} />}
      {showSave && <SaveModal rows={rows} edits={edits} deletions={deletions} additions={additions} adapter={adapter} onSuccess={handleSaveSuccess} onClose={() => setShowSave(false)} />}
      {mergeTarget && (
        <MergeModal
          rowA={mergeTarget.rowA}
          rowB={mergeTarget.rowB}
          editsA={edits}
          editsB={edits}
          onMerge={handleMerge}
          onClose={() => setMergeTarget(null)}
        />
      )}
      {showLogic && <LogicModal onClose={() => setShowLogic(false)} />}
      {venueDetail !== null && rows.find(r => r._idx === venueDetail) && (
        <VenueDetailModal
          rowIndex={venueDetail}
          row={rows.find(r => r._idx === venueDetail)}
          edits={edits}
          onEdit={handleEdit}
          onClose={() => setVenueDetail(null)}
          onDelete={handleDelete}
          onSave={() => setShowSave(true)}
          editCount={editCount}
          duplicatePartners={duplicatePartners[venueDetail] || []}
          onDismissDuplicate={handleDismiss}
          onOpenMerge={handleOpenMerge}
          bandOptions={bandOptions}
          typeOptions={typeOptions}
          onAddType={handleAddType}
          templates={templates}
          languages={settings.languages}
          settings={settings}
          draftedAtIso={draftedAt(settings, rows.find(r => r._idx === venueDetail) || {})}
          onDraftCreated={recordDraft}
          onOpenMap={() => {
            const row = rows.find(r => r._idx === venueDetail)
            setMapFocusRow(row)
            setVenueDetail(null)
            setView('map')
          }}
        />
      )}
    </div>
    </RulesProvider>
  )
}
