import { join } from 'node:path'
import { app, shell, dialog, BrowserWindow, Menu, protocol, net } from 'electron'
import { pathToFileURL } from 'node:url'
import { registerIpc } from './ipc/index.js'
import { checkForUpdates } from './ipc/updates.js'

const isDev = !app.isPackaged

// TipTap inline images live in userData/templates/assets and are served to the
// renderer through this scheme (a plain file:// URL is blocked by the CSP).
const ASSET_SCHEME = 'booking-asset'
protocol.registerSchemesAsPrivileged([
  { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: false } },
])

function assetsDir() {
  return join(app.getPath('userData'), 'templates', 'assets')
}

function registerAssetProtocol() {
  protocol.handle(ASSET_SCHEME, request => {
    // booking-asset://<id> → userData/templates/assets/<id>
    const url = new URL(request.url)
    const name = decodeURIComponent(`${url.hostname}${url.pathname}`).replace(/\/+$/, '')
    // Never let a crafted id escape the assets directory.
    if (!name || name.includes('..') || name.includes('/')) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(join(assetsDir(), name)).toString())
  })
}

// Menu items act on whichever window is in front; the menu is built once, before
// any window exists, so the lookup has to happen at click time.
function currentWindow() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null
}

function sendToRenderer(channel) {
  currentWindow()?.webContents.send(channel)
}

// "Check for Updates…" — nothing installs itself; we compare against the latest
// GitHub release and hand the user the download page.
async function promptForUpdate() {
  const parent = currentWindow()
  const result = await checkForUpdates({ currentVersion: app.getVersion() })

  if (result.error) {
    await dialog.showMessageBox(parent, {
      type: 'info',
      message: 'Could not check for updates',
      detail: result.error,
      buttons: ['OK'],
    })
    return
  }

  if (!result.newer) {
    await dialog.showMessageBox(parent, {
      type: 'info',
      message: `Booking ${result.current} is up to date.`,
      detail: `The latest published release is ${result.latest}.`,
      buttons: ['OK'],
    })
    return
  }

  const { response } = await dialog.showMessageBox(parent, {
    type: 'info',
    message: `Booking ${result.latest} is available.`,
    detail: `You are running ${result.current}.\n\nDownload the .dmg, drag it to Applications and replace the old copy. The first launch needs a right-click → Open.${result.notes ? `\n\n${String(result.notes).slice(0, 600)}` : ''}`,
    buttons: ['Download', 'Later'],
    defaultId: 0,
    cancelId: 1,
  })
  if (response === 0) shell.openExternal(result.url)
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Check for Updates…', click: () => { promptForUpdate() } },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => sendToRenderer('menu:openSettings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'Email Templates…', accelerator: 'CmdOrCtrl+T', click: () => sendToRenderer('menu:openTemplates') },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    // Required: without a real Edit menu ⌘C/⌘V/⌘Z do nothing in the renderer.
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Booking',
    // A standard title bar, on purpose. With `hiddenInset` the only draggable
    // area is the thin strip the renderer happens to leave free, and every
    // `fixed inset-0` modal covers it — the window then reads as immovable.
    titleBarStyle: 'default',
    resizable: true,
    movable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: true,
    backgroundColor: '#f9fafb',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.on('ready-to-show', () => win.show())

  // In dev, surface renderer console output on the terminal so a headless run
  // (or a run behind the window) still shows errors.
  if (isDev) {
    win.webContents.on('console-message', e => {
      console.log(`[renderer:${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`)
    })
    win.webContents.on('render-process-gone', (_e, details) => {
      console.error('[renderer gone]', details)
    })
  }

  // Anything that wants a new window (target=_blank, window.open) opens in the
  // user's browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  registerAssetProtocol()
  registerIpc()
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
