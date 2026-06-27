import { contextBridge, ipcRenderer } from 'electron'
import type { ChuckleAPI } from '../shared/ipc-types.js'

const api: ChuckleAPI = {
  vault: {
    list: () => ipcRenderer.invoke('vault:list'),
    create: (path, name, org) => ipcRenderer.invoke('vault:create', { path, name, org }),
    openExisting: (path) => ipcRenderer.invoke('vault:open-existing', { path }),
    selectDirectory: () => ipcRenderer.invoke('vault:select-directory'),
    sync: (vaultPath) => ipcRenderer.invoke('vault:sync', { vaultPath }),
    getRemote: (vaultPath) => ipcRenderer.invoke('vault:get-remote', { vaultPath }),
    log: (vaultPath) => ipcRenderer.invoke('vault:log', { vaultPath }),
    status: (vaultPath) => ipcRenderer.invoke('vault:status', { vaultPath }),
    push: (vaultPath) => ipcRenderer.invoke('vault:push', { vaultPath }),
    publishBranch: (vaultPath) => ipcRenderer.invoke('vault:publish-branch', { vaultPath }),
    author: (vaultPath) => ipcRenderer.invoke('vault:author', { vaultPath }),
  },
  features: {
    list: (vaultPath) => ipcRenderer.invoke('features:list', { vaultPath }),
  },
  document: {
    read: (vaultPath, feature, type) =>
      ipcRenderer.invoke('document:read', { vaultPath, feature, type }),
    write: (vaultPath, feature, type, content) =>
      ipcRenderer.invoke('document:write', { vaultPath, feature, type, content }),
    getApproval: (vaultPath, feature, type) =>
      ipcRenderer.invoke('document:get-approval', { vaultPath, feature, type }),
    approve: (vaultPath, feature, type, message) =>
      ipcRenderer.invoke('document:approve', { vaultPath, feature, type, message }),
    reject: (vaultPath, feature, type, message) =>
      ipcRenderer.invoke('document:reject', { vaultPath, feature, type, message }),
  },
  workflows: {
    read: (vaultPath) => ipcRenderer.invoke('workflows:read', { vaultPath }),
  },
  openExternal: (url) => ipcRenderer.invoke('app:open-external', { url }),
}

contextBridge.exposeInMainWorld('chuckle', api)
