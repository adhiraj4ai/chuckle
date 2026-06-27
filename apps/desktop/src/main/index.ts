import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
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
} from './vault-bridge.js'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Signoff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('vault:list', () => listVaults())
  ipcMain.handle('vault:remove', (_e, { vaultPath }) => removeVault(vaultPath))
  ipcMain.handle('vault:create', (_e, { path, name }) => createVault(path, name))
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
  ipcMain.handle('app:open-external', (_e, { url }) => shell.openExternal(url))
  ipcMain.handle('features:list', (_e, { vaultPath }) => listFeatures(vaultPath))
  ipcMain.handle('document:read', (_e, { vaultPath, feature, type }) => readDocument(vaultPath, feature, type))
  ipcMain.handle('document:write', (_e, { vaultPath, feature, type, content }) =>
    writeDocument(vaultPath, feature, type, content)
  )
  ipcMain.handle('document:get-approval', (_e, { vaultPath, feature, type }) => getDocumentApproval(vaultPath, feature, type))
  ipcMain.handle('review:action', (_e, { vaultPath, feature, type, action }) => reviewAction(vaultPath, feature, type, action))
  ipcMain.handle('comments:read', (_e, { vaultPath, feature, type }) => readDocComments(vaultPath, feature, type))
  ipcMain.handle('comments:add-thread', (_e, { vaultPath, feature, type, section, line, body }) => addCommentThread(vaultPath, feature, type, section, line, body))
  ipcMain.handle('comments:add-reply', (_e, { vaultPath, feature, type, threadId, body }) => addCommentReply(vaultPath, feature, type, threadId, body))
  ipcMain.handle('comments:set-resolved', (_e, { vaultPath, feature, type, threadId, resolved }) => setCommentResolved(vaultPath, feature, type, threadId, resolved))
  ipcMain.handle('project:read-claude-md', (_e, { vaultPath }) => readProjectClaudeMd(vaultPath))
  ipcMain.handle('workflows:read', (_e, { vaultPath }) => readVaultWorkflows(vaultPath))
  ipcMain.handle('workflows:write', (_e, { vaultPath, workflows }) => writeVaultWorkflows(vaultPath, workflows))
  ipcMain.handle('document:is-stale', (_e, { vaultPath, feature, type }) => isDocumentStale(vaultPath, feature, type))
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
