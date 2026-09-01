import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { app } from 'electron'
import { mergeRules, DEFAULT_RULES } from '../core/rules.js'
import { normalizeBands } from '../core/bands.js'

// Plain JSON in userData. Small, human-readable, and easy to back up — the CSV
// remains the only file that matters for the venue data itself.
export const DEFAULT_SETTINGS = {
  storage: {
    adapter: 'file',           // 'file' | 'github'
    filePath: '',              // absolute path to the semicolon CSV
    github: { repo: '', path: '' },
  },
  rules: DEFAULT_RULES,
  bands: [],
  languages: {
    default: 'en',
    map: {
      Germany: 'de', Deutschland: 'de',
      Austria: 'de', 'Österreich': 'de',
      Switzerland: 'de', Schweiz: 'de',
    },
  },
  mail: {
    host: 'imap.mail.me.com',
    port: 993,
    user: '',
    fromAddress: '',
    fromName: '',
    draftsMailbox: '',
  },
  dismissedDupes: [],
  draftLog: {},                // 'Venue||City||Band' → ISO timestamp
}

function settingsPath() {
  return join(app.getPath('userData'), 'settings.json')
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

// Shallow-merge each top-level section over its defaults, so a settings file
// written by an older version never loses a newly-added key.
function withDefaults(stored) {
  const s = isPlainObject(stored) ? stored : {}
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    storage: {
      ...DEFAULT_SETTINGS.storage,
      ...(s.storage || {}),
      github: { ...DEFAULT_SETTINGS.storage.github, ...(s.storage?.github || {}) },
    },
    rules: mergeRules(s.rules),
    bands: normalizeBands(s.bands),
    languages: {
      default: s.languages?.default || DEFAULT_SETTINGS.languages.default,
      map: isPlainObject(s.languages?.map) ? s.languages.map : { ...DEFAULT_SETTINGS.languages.map },
    },
    mail: { ...DEFAULT_SETTINGS.mail, ...(s.mail || {}) },
    dismissedDupes: Array.isArray(s.dismissedDupes) ? s.dismissedDupes : [],
    draftLog: isPlainObject(s.draftLog) ? s.draftLog : {},
  }
}

export function readSettings() {
  try {
    return withDefaults(JSON.parse(readFileSync(settingsPath(), 'utf8')))
  } catch {
    // Missing or corrupt file → defaults. Never throw here: the app must boot.
    return withDefaults(null)
  }
}

// Atomic write: a temp file in the SAME directory, then rename. Same-dir matters
// on iCloud Drive and across volumes, where rename() across directories can fail.
export function writeSettings(next) {
  const target = settingsPath()
  const merged = withDefaults(next)
  mkdirSync(dirname(target), { recursive: true })
  const tmp = `${target}.${process.pid}.tmp`
  try {
    writeFileSync(tmp, JSON.stringify(merged, null, 2), 'utf8')
    renameSync(tmp, target)
  } catch (e) {
    if (existsSync(tmp)) { try { unlinkSync(tmp) } catch { /* ignore */ } }
    throw e
  }
  return merged
}

// Merge a partial update over what is on disk (top-level sections replaced whole).
export function patchSettings(patch) {
  return writeSettings({ ...readSettings(), ...(patch || {}) })
}
