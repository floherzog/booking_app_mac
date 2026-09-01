import { ipcMain, shell } from 'electron'

// Every renderer→main call goes through ipcMain.handle. The preload re-exposes
// exactly this list as window.bookingApi.* — the renderer never sees ipcRenderer.
export function registerIpc() {
  ipcMain.handle('app:openExternal', (_e, url) => shell.openExternal(url))
}
