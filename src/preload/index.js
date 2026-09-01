import { contextBridge, ipcRenderer } from 'electron'

const api = {
  openExternal: url => ipcRenderer.invoke('app:openExternal', url),
}

contextBridge.exposeInMainWorld('bookingApi', api)
