import { join } from 'node:path'
import { app, shell, BrowserWindow, Menu, protocol, net } from 'electron'
import { pathToFileURL } from 'node:url'
import { registerIpc } from './ipc/index.js'

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

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
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
    // Required: without a real Edit menu ⌘C/⌘V/⌘Z do nothing in the renderer.
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
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
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }] },
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
    titleBarStyle: 'hiddenInset',
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
