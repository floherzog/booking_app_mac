import { contextBridge, ipcRenderer } from 'electron'

// The only channels main is allowed to push to the renderer. Keeping this an
// explicit allowlist means `onMenu` can never be turned into a general
// ipcRenderer.on for arbitrary traffic.
const MENU_CHANNELS = ['menu:openSettings', 'menu:openTemplates']

// The complete renderer-visible API. Nothing here hands out a raw ipcRenderer,
// and no secret value ever crosses the bridge — only `has…` booleans.
const api = {
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: next => ipcRenderer.invoke('settings:set', next),

  // Secrets (keychain-backed, main-process only)
  setSecret: (key, value) => ipcRenderer.invoke('secrets:set', key, value),
  hasSecret: key => ipcRenderer.invoke('secrets:has', key),
  deleteSecret: key => ipcRenderer.invoke('secrets:delete', key),

  // Native file pickers
  pickCsvOpen: () => ipcRenderer.invoke('dialog:pickCsvOpen'),
  pickCsvSave: defaultName => ipcRenderer.invoke('dialog:pickCsvSave', defaultName),

  // Local CSV file storage
  readCsvFile: path => ipcRenderer.invoke('storage:readCsvFile', path),
  writeCsvFile: args => ipcRenderer.invoke('storage:writeCsvFile', args),
  createCsvFile: path => ipcRenderer.invoke('storage:createCsvFile', path),
  exportCsv: (text, defaultName) => ipcRenderer.invoke('storage:exportCsv', text, defaultName),

  // GitHub storage
  githubFetchCsv: args => ipcRenderer.invoke('github:fetchCsv', args),
  githubPushCsv: args => ipcRenderer.invoke('github:pushCsv', args),

  // Email templates
  listTemplates: () => ipcRenderer.invoke('templates:list'),
  getTemplate: id => ipcRenderer.invoke('templates:get', id),
  saveTemplate: template => ipcRenderer.invoke('templates:save', template),
  deleteTemplate: id => ipcRenderer.invoke('templates:delete', id),
  saveTemplateAsset: args => ipcRenderer.invoke('templates:saveAsset', args),
  fetchVideoThumb: url => ipcRenderer.invoke('templates:fetchVideoThumb', url),

  // Apple Mail drafts
  testMailConnection: () => ipcRenderer.invoke('mail:testConnection'),
  appendDraft: args => ipcRenderer.invoke('mail:appendDraft', args),
  appleScriptDraft: args => ipcRenderer.invoke('mail:appleScriptDraft', args),
  appleScriptCheck: () => ipcRenderer.invoke('mail:appleScriptCheck'),

  // Geocoding (Nominatim needs a User-Agent the renderer may not set)
  geocode: (city, country) => ipcRenderer.invoke('geo:geocode', city, country),
  geoCacheSnapshot: () => ipcRenderer.invoke('geo:cacheSnapshot'),

  // Updates (compare against the latest GitHub release; nothing self-installs)
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),

  openExternal: url => ipcRenderer.invoke('app:openExternal', url),

  // Menu → renderer. Returns an unsubscribe function for use in a useEffect.
  onMenu: (channel, cb) => {
    if (!MENU_CHANNELS.includes(channel)) return () => {}
    const handler = () => cb()
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
}

contextBridge.exposeInMainWorld('bookingApi', api)
