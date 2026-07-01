import { contextBridge, ipcRenderer } from 'electron'
import type { SignoffAPI } from '../shared/ipc-types.js'

const api: SignoffAPI = {
  vault: {
    list: () => ipcRenderer.invoke('vault:list'),
    remove: (vaultPath) => ipcRenderer.invoke('vault:remove', { vaultPath }),
    create: (path, name, approvers) => ipcRenderer.invoke('vault:create', { path, name, approvers }),
    onSetupProgress: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, p: { done: number; total: number }) => cb(p)
      ipcRenderer.on('vault:setup-progress', listener)
      return () => ipcRenderer.removeListener('vault:setup-progress', listener)
    },
    openExisting: (path) => ipcRenderer.invoke('vault:open-existing', { path }),
    selectDirectory: () => ipcRenderer.invoke('vault:select-directory'),
    sync: (vaultPath) => ipcRenderer.invoke('vault:sync', { vaultPath }),
    getRemote: (vaultPath) => ipcRenderer.invoke('vault:get-remote', { vaultPath }),
    log: (vaultPath) => ipcRenderer.invoke('vault:log', { vaultPath }),
    status: (vaultPath) => ipcRenderer.invoke('vault:status', { vaultPath }),
    push: (vaultPath) => ipcRenderer.invoke('vault:push', { vaultPath }),
    publishBranch: (vaultPath) => ipcRenderer.invoke('vault:publish-branch', { vaultPath }),
    author: (vaultPath) => ipcRenderer.invoke('vault:author', { vaultPath }),
    connectRemote: (vaultPath, url) => ipcRenderer.invoke('vault:connect-remote', { vaultPath, url }),
    clone: (url, destDir) => ipcRenderer.invoke('vault:clone', { url, destDir }),
    syncState: (vaultPath) => ipcRenderer.invoke('vault:sync-state', { vaultPath }),
    connectClaude: (vaultPath) => ipcRenderer.invoke('vault:connect-claude', { vaultPath }),
  },
  features: {
    list: (vaultPath) => ipcRenderer.invoke('features:list', { vaultPath }),
    setCategory: (vaultPath, feature, categoryId) =>
      ipcRenderer.invoke('feature:set-category', { vaultPath, feature, categoryId }),
    setTags: (vaultPath, feature, tags) =>
      ipcRenderer.invoke('feature:set-tags', { vaultPath, feature, tags }),
    setTier: (vaultPath, feature, tier) =>
      ipcRenderer.invoke('feature:set-tier', { vaultPath, feature, tier }),
  },
  categories: {
    list: (vaultPath) => ipcRenderer.invoke('categories:list', { vaultPath }),
    upsert: (vaultPath, category) => ipcRenderer.invoke('categories:upsert', { vaultPath, category }),
    remove: (vaultPath, id) => ipcRenderer.invoke('categories:remove', { vaultPath, id }),
  },
  document: {
    read: (vaultPath, feature, type) =>
      ipcRenderer.invoke('document:read', { vaultPath, feature, type }),
    write: (vaultPath, feature, type, content) =>
      ipcRenderer.invoke('document:write', { vaultPath, feature, type, content }),
    getApproval: (vaultPath, feature, type) =>
      ipcRenderer.invoke('document:get-approval', { vaultPath, feature, type }),
    isStale: (vaultPath, feature, type) =>
      ipcRenderer.invoke('document:is-stale', { vaultPath, feature, type }),
    getStatus: (vaultPath, feature, type) =>
      ipcRenderer.invoke('document:get-status', { vaultPath, feature, type }),
  },
  review: {
    action: (vaultPath, feature, type, action, message) =>
      ipcRenderer.invoke('review:action', { vaultPath, feature, type, action, message }),
  },
  comments: {
    read: (vaultPath, feature, type) =>
      ipcRenderer.invoke('comments:read', { vaultPath, feature, type }),
    addThread: (vaultPath, feature, type, section, line, body) =>
      ipcRenderer.invoke('comments:add-thread', { vaultPath, feature, type, section, line, body }),
    addReply: (vaultPath, feature, type, threadId, body) =>
      ipcRenderer.invoke('comments:add-reply', { vaultPath, feature, type, threadId, body }),
    setResolved: (vaultPath, feature, type, threadId, resolved) =>
      ipcRenderer.invoke('comments:set-resolved', { vaultPath, feature, type, threadId, resolved }),
  },
  project: {
    readClaudeMd: (vaultPath) =>
      ipcRenderer.invoke('project:read-claude-md', { vaultPath }),
  },
  workflows: {
    read: (vaultPath) => ipcRenderer.invoke('workflows:read', { vaultPath }),
    write: (vaultPath, workflows) => ipcRenderer.invoke('workflows:write', { vaultPath, workflows }),
  },
  openExternal: (url) => ipcRenderer.invoke('app:open-external', { url }),
}

contextBridge.exposeInMainWorld('signoff', api)
