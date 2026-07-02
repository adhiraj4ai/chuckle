import { app, BrowserWindow, ipcMain, dialog, shell, session } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'node:url'

// The main process is bundled as ESM, where `__dirname` is undefined. Derive it
// from import.meta.url so the preload + production renderer paths resolve in the
// packaged app (dev uses ELECTRON_RENDERER_URL and never hit this).
const appDir = dirname(fileURLToPath(import.meta.url))
import {
  listVaults,
  removeVault,
  createVault,
  openExistingVault,
  syncVault,
  listFeatures,
  readDocument,
  writeDocument,
  getDocumentApproval,
  getDocumentStatus,
  readAuditLog,
  reviewAction,
  readDocComments,
  addCommentThread,
  addCommentReply,
  setCommentResolved,
  readProjectClaudeMd,
  readVaultWorkflows,
  writeVaultWorkflows,
  isDocumentStale,
  getVaultRemote,
  getVaultLog,
  getVaultStatus,
  pushVault,
  publishBranch,
  getVaultAuthor,
  connectRemote,
  cloneVault,
  getSyncStateBridge,
  listCategoriesBridge,
  upsertCategoryBridge,
  removeCategoryBridge,
  setFeatureCategoryBridge,
  setFeatureTagsBridge,
  setFeatureTierBridge,
  setFeatureTicketBridge,
} from './vault-bridge.js'
import {
  applyInstall,
  removeInstall,
  installStatus,
} from './installer.js'
import {
  isAllowedExternalUrl,
  isAllowedNavigation,
  contentSecurityPolicy,
  rendererWebPreferences,
} from './security.js'
import { connectClaudeCode } from './connect-claude.js'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Signoff',
    webPreferences: rendererWebPreferences(join(appDir, '../preload/index.cjs')),
  })

  // Hardening: the renderer is a bundled local app and should never open new
  // windows or navigate away from its own origin. Block both — any external
  // link must go through the validated app:open-external IPC instead.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, win.webContents.getURL())) event.preventDefault()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(appDir, '../renderer/index.html'))
  }
}

/**
 * Apply a strict Content-Security-Policy to every renderer response. The app is
 * fully bundled (Vite inlines mermaid/katex/highlight.js and their assets), so
 * no remote origins are needed. We allow inline styles/data: images because the
 * bundler emits inline <style> tags and SVG data: URIs (e.g. the favicon), and
 * 'unsafe-eval' is required by the dev server's HMR runtime only.
 */
function applyContentSecurityPolicy(): void {
  const dev = !!process.env['ELECTRON_RENDERER_URL']
  const csp = contentSecurityPolicy(dev)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    })
  })
}

function registerIpcHandlers(): void {
  ipcMain.handle('vault:list', () => listVaults())
  ipcMain.handle('vault:remove', (_e, { vaultPath }) => removeVault(vaultPath))
  ipcMain.handle('vault:create', (_e, { path, name, approvers }) =>
    createVault(path, name, approvers, (done, total) => {
      if (!_e.sender.isDestroyed()) _e.sender.send('vault:setup-progress', { done, total })
    })
  )
  ipcMain.handle('vault:open-existing', (_e, { path }) => openExistingVault(path))
  ipcMain.handle('vault:select-directory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  ipcMain.handle('vault:sync', (_e, { vaultPath }) => syncVault(vaultPath))
  ipcMain.handle('vault:get-remote', (_e, { vaultPath }) => getVaultRemote(vaultPath))
  ipcMain.handle('vault:log', (_e, { vaultPath }) => getVaultLog(vaultPath))
  ipcMain.handle('vault:status', (_e, { vaultPath }) => getVaultStatus(vaultPath))
  ipcMain.handle('vault:push', (_e, { vaultPath }) => pushVault(vaultPath))
  ipcMain.handle('vault:publish-branch', (_e, { vaultPath }) => publishBranch(vaultPath))
  ipcMain.handle('vault:author', (_e, { vaultPath }) => getVaultAuthor(vaultPath))
  ipcMain.handle('app:open-external', async (_e, { url }) => {
    // Only ever hand http(s) URLs to the OS. A renderer-supplied value with any
    // other scheme (file:, javascript:, smb:, custom protocol handlers, …)
    // could trigger arbitrary local handlers — refuse it.
    if (!isAllowedExternalUrl(String(url))) {
      return { ok: false, error: `refused to open ${String(url)}` }
    }
    await shell.openExternal(new URL(String(url)).toString())
    return { ok: true }
  })
  ipcMain.handle('features:list', (_e, { vaultPath }) => listFeatures(vaultPath))
  ipcMain.handle('categories:list', (_e, { vaultPath }) => listCategoriesBridge(vaultPath))
  ipcMain.handle('categories:upsert', (_e, { vaultPath, category }) => upsertCategoryBridge(vaultPath, category))
  ipcMain.handle('categories:remove', (_e, { vaultPath, id }) => removeCategoryBridge(vaultPath, id))
  ipcMain.handle('feature:set-category', (_e, { vaultPath, feature, categoryId }) => setFeatureCategoryBridge(vaultPath, feature, categoryId))
  ipcMain.handle('feature:set-tags', (_e, { vaultPath, feature, tags }) => setFeatureTagsBridge(vaultPath, feature, tags))
  ipcMain.handle('feature:set-tier', (_e, { vaultPath, feature, tier }) => setFeatureTierBridge(vaultPath, feature, tier))
  ipcMain.handle('feature:set-ticket', (_e, { vaultPath, feature, ticket }) => setFeatureTicketBridge(vaultPath, feature, ticket))
  ipcMain.handle('document:read', (_e, { vaultPath, feature, type }) => readDocument(vaultPath, feature, type))
  ipcMain.handle('document:write', (_e, { vaultPath, feature, type, content }) =>
    writeDocument(vaultPath, feature, type, content)
  )
  ipcMain.handle('document:get-approval', (_e, { vaultPath, feature, type }) => getDocumentApproval(vaultPath, feature, type))
  ipcMain.handle('document:get-status', (_e, { vaultPath, feature, type }) => getDocumentStatus(vaultPath, feature, type))
  ipcMain.handle('audit:read', (_e, { vaultPath, feature }) => readAuditLog(vaultPath, feature))
  ipcMain.handle('review:action', (_e, { vaultPath, feature, type, action, message }) => reviewAction(vaultPath, feature, type, action, message))
  ipcMain.handle('comments:read', (_e, { vaultPath, feature, type }) => readDocComments(vaultPath, feature, type))
  ipcMain.handle('comments:add-thread', (_e, { vaultPath, feature, type, section, line, body, quote }) => addCommentThread(vaultPath, feature, type, section, line, body, quote))
  ipcMain.handle('comments:add-reply', (_e, { vaultPath, feature, type, threadId, body }) => addCommentReply(vaultPath, feature, type, threadId, body))
  ipcMain.handle('comments:set-resolved', (_e, { vaultPath, feature, type, threadId, resolved }) => setCommentResolved(vaultPath, feature, type, threadId, resolved))
  ipcMain.handle('project:read-claude-md', (_e, { vaultPath }) => readProjectClaudeMd(vaultPath))
  ipcMain.handle('workflows:read', (_e, { vaultPath }) => readVaultWorkflows(vaultPath))
  ipcMain.handle('workflows:write', (_e, { vaultPath, workflows }) => writeVaultWorkflows(vaultPath, workflows))
  ipcMain.handle('document:is-stale', (_e, { vaultPath, feature, type }) => isDocumentStale(vaultPath, feature, type))
  ipcMain.handle('vault:connect-remote', (_e, { vaultPath, url }) => connectRemote(vaultPath, url))
  ipcMain.handle('vault:clone', (_e, { url, destDir }) => cloneVault(url, destDir))
  ipcMain.handle('vault:sync-state', (_e, { vaultPath }) => getSyncStateBridge(vaultPath))
  ipcMain.handle('vault:connect-claude', (_e, { vaultPath }) => connectClaudeCode(vaultPath))
  ipcMain.handle('install:status', (_e, { vaultPath }) => installStatus(dirname(vaultPath)))
  ipcMain.handle('install:apply', (_e, { vaultPath, components }) => applyInstall(dirname(vaultPath), vaultPath, components))
  ipcMain.handle('install:remove', (_e, { vaultPath, components }) => removeInstall(dirname(vaultPath), components))
}

app.whenReady().then(() => {
  applyContentSecurityPolicy()
  registerIpcHandlers()
  createWindow()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
