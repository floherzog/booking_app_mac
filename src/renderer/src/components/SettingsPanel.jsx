import { useState, useEffect } from 'react'
import { getStoredTheme, setTheme } from '../lib/theme'
import { exportCsv } from '../lib/csvFile'
import { validateRules } from '@core/rules'
import RulesEditor from './RulesEditor'
import LanguagesEditor from './LanguagesEditor'

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light',  label: 'Light' },
  { value: 'dark',   label: 'Dark' },
]

const SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'storage', label: 'Storage' },
  { id: 'rules', label: 'Rules' },
  { id: 'bands', label: 'Bands' },
  { id: 'languages', label: 'Languages' },
  { id: 'templates', label: 'Templates' },
  { id: 'mail', label: 'Mail' },
  { id: 'data', label: 'Data' },
]

export default function SettingsPanel({ config, rows = [], onOpenImport, onOpenTemplates, onSave, onPersist, onClose }) {
  const [form, setForm] = useState(config)
  const [section, setSection] = useState('general')
  // Theme stays a per-Mac preference in localStorage (see the note in the
  // General section) and applies immediately rather than on Save.
  const [theme, setThemeState] = useState(getStoredTheme)
  const [newBand, setNewBand] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [hasGithubToken, setHasGithubToken] = useState(false)
  const [imapPassword, setImapPassword] = useState('')
  const [hasImapPassword, setHasImapPassword] = useState(false)
  // Populated by Test connection, so the Drafts picker only ever offers real mailboxes.
  const [mailboxes, setMailboxes] = useState([])
  const [mailTest, setMailTest] = useState('')
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const bands = form.bands || []
  const storage = form.storage || {}
  const mail = form.mail || {}
  const ruleErrors = validateRules(form.rules)

  useEffect(() => {
    window.bookingApi.hasSecret('githubToken').then(setHasGithubToken).catch(() => {})
    window.bookingApi.hasSecret('imapPassword').then(setHasImapPassword).catch(() => {})
  }, [])

  function handleTheme(value) {
    setThemeState(value)
    setTheme(value)
  }

  // Persisting settings is App's job (one writer for settings.json); the token
  // is the exception — it goes straight to the keychain, never into settings.
  async function handleSave(e) {
    e.preventDefault()
    if (ruleErrors.length) { setSection('rules'); return }
    setSaving(true)
    setError('')
    try {
      if (githubToken.trim()) await window.bookingApi.setSecret('githubToken', githubToken.trim())
      if (imapPassword.trim()) await window.bookingApi.setSecret('imapPassword', imapPassword.trim())
      await onSave(form)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function setMail(patch) {
    setForm(f => ({ ...f, mail: { ...f.mail, ...patch } }))
  }

  // Test connection has to run against what is on screen, so the password is
  // written to the keychain and the settings persisted before we connect.
  async function testMail() {
    setTesting(true)
    setMailTest('')
    try {
      if (imapPassword.trim()) {
        await window.bookingApi.setSecret('imapPassword', imapPassword.trim())
        setHasImapPassword(true)
        setImapPassword('')
      }
      // Persist without the band-propagation prompts a full Save runs.
      await onPersist(form)
      const { mailboxes: boxes, suggestion } = await window.bookingApi.testMailConnection()
      setMailboxes(boxes)
      if (!form.mail?.draftsMailbox && suggestion) setMail({ draftsMailbox: suggestion })
      setMailTest(`Connected — ${boxes.length} mailboxes. Drafts: ${form.mail?.draftsMailbox || suggestion}`)
    } catch (e) {
      setMailTest(e.message)
    } finally {
      setTesting(false)
    }
  }

  async function forgetImapPassword() {
    await window.bookingApi.deleteSecret('imapPassword')
    setHasImapPassword(false)
    setImapPassword('')
  }

  function setStorage(patch) {
    setForm(f => ({ ...f, storage: { ...f.storage, ...patch } }))
  }

  async function chooseFile() {
    const picked = await window.bookingApi.pickCsvOpen()
    if (picked) setStorage({ filePath: picked })
  }

  async function forgetToken() {
    await window.bookingApi.deleteSecret('githubToken')
    setHasGithubToken(false)
    setGithubToken('')
  }

  function handleExport() {
    exportCsv(rows).catch(() => { /* the user cancelled the save dialog */ })
  }

  // --- Band list -------------------------------------------------------------
  // Bands are objects: { name, tourDates, bookFiller }.
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

  const input = 'block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500'
  const monoInput = `${input} font-mono`
  const lbl = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'
  const outlineBtn = 'py-1.5 px-3 rounded-md text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-gray-400 dark:hover:border-gray-500 disabled:opacity-40 transition-colors'

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[1100] p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Settings</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSave} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 flex">
            {/* Section rail */}
            <nav className="w-40 shrink-0 border-r border-gray-100 dark:border-gray-700 py-3 space-y-0.5 overflow-y-auto">
              {SECTIONS.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSection(s.id)}
                  className={`w-full text-left px-4 py-1.5 text-sm transition-colors ${section === s.id
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                >
                  {s.label}
                  {s.id === 'rules' && ruleErrors.length > 0 && (
                    <span className="ml-1.5 text-red-500" title="This section has errors">•</span>
                  )}
                </button>
              ))}
            </nav>

            <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5">
              {section === 'general' && (
                <div className="space-y-4">
                  <div>
                    <p className={lbl}>Appearance</p>
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
                    <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                      Applies straight away and is remembered per Mac, so it isn’t part of the settings
                      file you might sync between machines.
                    </p>
                  </div>
                </div>
              )}

              {section === 'storage' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    {[
                      { value: 'file', label: 'Local CSV file', hint: 'Anywhere on this Mac — iCloud Drive keeps it in sync.' },
                      { value: 'github', label: 'GitHub repository', hint: 'Shares one list with the web app and the booking script.' },
                    ].map(o => (
                      <label key={o.value} className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="storage-adapter"
                          className="mt-0.5 h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-400"
                          checked={storage.adapter === o.value}
                          onChange={() => setStorage({ adapter: o.value })}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm text-gray-800 dark:text-gray-200">{o.label}</span>
                          <span className="block text-xs text-gray-400 dark:text-gray-500">{o.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>

                  {storage.adapter === 'github' ? (
                    <div className="space-y-3">
                      <div>
                        <label className={lbl}>Repository (owner/name)</label>
                        <input className={monoInput} value={storage.github?.repo || ''} placeholder="you/booking_list"
                          onChange={e => setStorage({ github: { ...storage.github, repo: e.target.value } })} />
                      </div>
                      <div>
                        <label className={lbl}>File path in the repo</label>
                        <input className={monoInput} value={storage.github?.path || ''} placeholder="data/booking.csv"
                          onChange={e => setStorage({ github: { ...storage.github, path: e.target.value } })} />
                      </div>
                      <div>
                        <label className={lbl}>Personal access token (repo scope)</label>
                        <input
                          type="password"
                          className={monoInput}
                          value={githubToken}
                          onChange={e => setGithubToken(e.target.value)}
                          placeholder={hasGithubToken ? '•••••••• (stored — type to replace)' : 'ghp_…'}
                        />
                        <div className="mt-1 flex items-center justify-between gap-3">
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            Kept in your macOS keychain, never in the settings file.
                          </p>
                          {hasGithubToken && (
                            <button type="button" onClick={forgetToken} className="shrink-0 text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400 underline">
                              Forget token
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className={lbl}>CSV file</label>
                      <div className="flex gap-2 items-center">
                        <input className={`${monoInput} flex-1`} value={storage.filePath || ''} readOnly placeholder="No file chosen" />
                        <button type="button" onClick={chooseFile} className={`${outlineBtn} shrink-0`}>Choose…</button>
                      </div>
                      <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                        Saving rewrites this file in place. If it lives in iCloud Drive, don’t edit it on two
                        Macs at once — the app warns you if it changed underneath, but it can’t merge.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {section === 'rules' && (
                <RulesEditor rules={form.rules} onChange={rules => setForm(f => ({ ...f, rules }))} />
              )}

              {section === 'languages' && (
                <LanguagesEditor languages={form.languages} onChange={languages => setForm(f => ({ ...f, languages }))} />
              )}

              {section === 'bands' && (
                <div>
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
                    On Save, if you changed a band's touring dates or filler flag, you'll be asked whether to
                    also write them onto that band's venue rows (the <span className="font-mono">Dates</span> /
                    <span className="font-mono"> filler</span> columns). Renaming only changes this list — it
                    doesn't rewrite existing venues.
                  </p>
                </div>
              )}

              {section === 'templates' && (
                <div>
                  <button type="button" onClick={() => onOpenTemplates?.()} className={outlineBtn}>
                    Manage email templates…
                  </button>
                  <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                    One template per band and language. A venue's Country picks the language through
                    the map in the Languages section; anything unlisted falls back to the default.
                    Templates live in the app's own folder, separate from your settings file.
                  </p>
                </div>
              )}

              {section === 'mail' && (
                <div className="space-y-4">
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Drafts are placed straight into your Drafts mailbox over IMAP — nothing is ever sent.
                    iCloud needs an <span className="font-medium">app-specific password</span>, not your
                    Apple ID password.{' '}
                    <button type="button" onClick={() => window.bookingApi.openExternal('https://appleid.apple.com')} className="underline hover:text-gray-600 dark:hover:text-gray-300">
                      Create one at appleid.apple.com
                    </button>
                  </p>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className={lbl}>IMAP server</label>
                      <input className={monoInput} value={mail.host || ''} placeholder="imap.mail.me.com"
                        onChange={e => setMail({ host: e.target.value })} />
                    </div>
                    <div>
                      <label className={lbl}>Port</label>
                      <input className={monoInput} value={mail.port ?? 993}
                        onChange={e => setMail({ port: parseInt(e.target.value, 10) || '' })} />
                    </div>
                  </div>

                  <div>
                    <label className={lbl}>Username (your full email address)</label>
                    <input className={monoInput} value={mail.user || ''} placeholder="you@icloud.com"
                      onChange={e => setMail({ user: e.target.value })} />
                  </div>

                  <div>
                    <label className={lbl}>App-specific password</label>
                    <input type="password" className={monoInput} value={imapPassword}
                      onChange={e => setImapPassword(e.target.value)}
                      placeholder={hasImapPassword ? '•••••••• (stored — type to replace)' : 'abcd-efgh-ijkl-mnop'} />
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="text-xs text-gray-400 dark:text-gray-500">Kept in your macOS keychain.</p>
                      {hasImapPassword && (
                        <button type="button" onClick={forgetImapPassword} className="shrink-0 text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400 underline">
                          Forget password
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>From name</label>
                      <input className={input} value={mail.fromName || ''} placeholder="Your name"
                        onChange={e => setMail({ fromName: e.target.value })} />
                    </div>
                    <div>
                      <label className={lbl}>From address</label>
                      <input className={monoInput} value={mail.fromAddress || ''} placeholder="defaults to the username"
                        onChange={e => setMail({ fromAddress: e.target.value })} />
                    </div>
                  </div>

                  <div>
                    <label className={lbl}>Drafts mailbox</label>
                    {mailboxes.length > 0 ? (
                      <select className={input} value={mail.draftsMailbox || ''} onChange={e => setMail({ draftsMailbox: e.target.value })}>
                        {mailboxes.map(m => (
                          <option key={m.path} value={m.path}>
                            {m.path}{m.specialUse === '\\Drafts' ? '  (Drafts)' : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input className={monoInput} value={mail.draftsMailbox || ''} placeholder="found automatically — or type a name"
                        onChange={e => setMail({ draftsMailbox: e.target.value })} />
                    )}
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      Left blank, the app uses whichever mailbox your server marks as Drafts.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button type="button" onClick={testMail} disabled={testing} className={outlineBtn}>
                      {testing ? 'Connecting…' : 'Test connection'}
                    </button>
                    {mailTest && <p className="text-xs text-gray-500 dark:text-gray-400 flex-1 min-w-0">{mailTest}</p>}
                  </div>
                </div>
              )}

              {section === 'data' && (
                <div>
                  <div className="flex gap-2">
                    <button type="button" onClick={handleExport} disabled={rows.length === 0} className={`${outlineBtn} flex-1`}>
                      Export CSV
                    </button>
                    <button type="button" onClick={() => onOpenImport?.()} className={`${outlineBtn} flex-1`}>
                      Import CSV…
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                    Export writes a copy wherever you point it. Import opens a guided wizard — replace the table
                    or add to it, and match your file's columns to the app's. Changes stay in the app until you
                    press Save.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
            <p className="text-xs text-red-600 dark:text-red-400 min-h-[1rem]">
              {error || (ruleErrors.length > 0 ? `${ruleErrors.length} problem${ruleErrors.length !== 1 ? 's' : ''} in Rules` : '')}
            </p>
            <div className="flex gap-3 shrink-0">
              <button type="button" onClick={onClose} className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || ruleErrors.length > 0}
                className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
