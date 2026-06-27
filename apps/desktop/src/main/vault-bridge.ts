import fs from 'node:fs/promises'
import path from 'node:path'
import { simpleGit } from 'simple-git'
import {
  VaultManager,
  readApproval,
  writeApproval,
  appendHistory,
  stageAndCommit,
  pushToRemote,
  pullLatest,
  readWorkflows,
  getApprovalStatus,
  listFeatureNames,
  documentPath,
  documentRelPath,
  approvalRelPath,
  type VaultInfo,
  type VaultWorkflows,
  type ApprovalRecord,
  type DocumentType,
} from '@chuckle/vault-core'
import type { FeatureEntry, GitCommit, GitStatus, ReviewResult, VaultOpenResult } from '../shared/ipc-types.js'

/** Push the just-made commit, reporting whether it reached the remote. */
async function trySync(vaultPath: string): Promise<ReviewResult> {
  try {
    await pushToRemote(vaultPath)
    return { pushed: true }
  } catch (err) {
    return { pushed: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

async function resolveVaultAuthor(vaultPath: string): Promise<{ name: string; email: string }> {
  const git = simpleGit(vaultPath)
  const [nameRes, emailRes] = await Promise.all([
    git.getConfig('user.name'),
    git.getConfig('user.email'),
  ])
  return { name: nameRes.value ?? 'Unknown', email: emailRes.value ?? 'unknown@local' }
}

export async function listVaults(): Promise<VaultInfo[]> {
  return VaultManager.listVaults()
}

/** Add `.chuckle/` to the project's .gitignore so the vault stays uncommitted there. */
async function ensureGitignored(projectRoot: string): Promise<void> {
  const gitignore = path.join(projectRoot, '.gitignore')
  let content = ''
  try {
    content = await fs.readFile(gitignore, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  if (content.split(/\r?\n/).some((l) => l.trim() === '.chuckle/' || l.trim() === '.chuckle')) return
  const prefix = content && !content.endsWith('\n') ? content + '\n' : content
  await fs.writeFile(gitignore, `${prefix}.chuckle/\n`)
}

/** Resolve a user-picked directory to a vault dir: a project root resolves to
 *  its `.chuckle/`; an already-vault dir (has config.json) is used directly. */
async function resolveVaultDir(selected: string): Promise<string> {
  const nested = path.join(selected, '.chuckle')
  try {
    await fs.access(path.join(nested, 'config.json'))
    return nested
  } catch {
    return selected
  }
}

export async function createVault(
  projectRoot: string,
  name: string,
  org: string
): Promise<VaultOpenResult> {
  const vaultDir = path.join(projectRoot, '.chuckle')
  const manager = await VaultManager.create(vaultDir, name, org)
  await ensureGitignored(projectRoot)
  await VaultManager.registerVault({
    name: manager.config.name,
    path: vaultDir,
    last_opened: new Date().toISOString(),
  })
  return { name: manager.config.name, path: vaultDir }
}

export async function openExistingVault(selected: string): Promise<VaultOpenResult> {
  const vaultDir = await resolveVaultDir(selected)
  const manager = await VaultManager.open(vaultDir)
  await VaultManager.registerVault({
    name: manager.config.name,
    path: vaultDir,
    last_opened: new Date().toISOString(),
  })
  return { name: manager.config.name, path: vaultDir }
}

export async function syncVault(vaultPath: string): Promise<void> {
  await pullLatest(vaultPath)
}

export async function listFeatures(vaultPath: string): Promise<FeatureEntry[]> {
  const entries = await listFeatureNames(vaultPath)
  const results: FeatureEntry[] = []
  for (const name of entries) {
    const [specStatus, planStatus] = await Promise.all([
      getApprovalStatus(vaultPath, name, 'spec'),
      getApprovalStatus(vaultPath, name, 'plan'),
    ])
    results.push({
      name,
      spec: specStatus.status,
      plan: planStatus.status,
    })
  }
  return results
}

export async function readDocument(vaultPath: string, feature: string, type: DocumentType): Promise<string> {
  return fs.readFile(documentPath(vaultPath, feature, type), 'utf-8')
}

export async function getDocumentApproval(
  vaultPath: string,
  feature: string,
  type: DocumentType
): Promise<ApprovalRecord | null> {
  return readApproval(vaultPath, feature, type)
}

/** Overwrite a document in the vault working tree and commit the edit. */
export async function writeDocument(
  vaultPath: string,
  feature: string,
  type: DocumentType,
  content: string
): Promise<ReviewResult> {
  await fs.writeFile(documentPath(vaultPath, feature, type), content)
  const { name, email } = await resolveVaultAuthor(vaultPath)
  await stageAndCommit(vaultPath, [documentRelPath(feature, type)], `docs(${feature}): edit ${type}`, email, name)
  return trySync(vaultPath)
}

export async function approveDocument(
  vaultPath: string,
  feature: string,
  type: DocumentType,
  message: string | null
): Promise<ReviewResult> {
  const record = await readApproval(vaultPath, feature, type)
  if (!record) throw new Error(`no approval record for ${feature}/${type}`)
  const { name, email } = await resolveVaultAuthor(vaultPath)
  const updated = appendHistory(record, {
    action: 'approved',
    by: email,
    at: new Date().toISOString(),
    message,
  })
  await writeApproval(vaultPath, updated)
  await stageAndCommit(vaultPath, [approvalRelPath(feature, type)], `review: approve ${feature}/${type}`, email, name)
  return trySync(vaultPath)
}

export async function rejectDocument(
  vaultPath: string,
  feature: string,
  type: DocumentType,
  message: string
): Promise<ReviewResult> {
  const record = await readApproval(vaultPath, feature, type)
  if (!record) throw new Error(`no approval record for ${feature}/${type}`)
  const { name, email } = await resolveVaultAuthor(vaultPath)
  const updated = appendHistory(record, {
    action: 'rejected',
    by: email,
    at: new Date().toISOString(),
    message,
  })
  await writeApproval(vaultPath, updated)
  await stageAndCommit(vaultPath, [approvalRelPath(feature, type)], `review: reject ${feature}/${type}`, email, name)
  return trySync(vaultPath)
}

export async function readVaultWorkflows(vaultPath: string): Promise<VaultWorkflows> {
  return readWorkflows(vaultPath)
}

/** The git identity (name + email) configured for this vault. */
export async function getVaultAuthor(vaultPath: string): Promise<{ name: string; email: string }> {
  return resolveVaultAuthor(vaultPath)
}

/** Recent commits in the vault repo, newest first. */
export async function getVaultLog(vaultPath: string): Promise<GitCommit[]> {
  try {
    const log = await simpleGit(vaultPath).log({ maxCount: 80 })
    return log.all.map((c) => ({
      hash: c.hash,
      short: c.hash.slice(0, 7),
      message: c.message,
      author: c.author_name,
      date: c.date,
      refs: c.refs,
    }))
  } catch {
    return []
  }
}

/** Branch + ahead/behind relative to the tracked remote branch. */
export async function getVaultStatus(vaultPath: string): Promise<GitStatus> {
  try {
    const s = await simpleGit(vaultPath).status()
    return { branch: s.current, tracking: s.tracking, ahead: s.ahead, behind: s.behind }
  } catch {
    return { branch: null, tracking: null, ahead: 0, behind: 0 }
  }
}

/** Push to the remote, reporting success/failure for the UI. */
export async function pushVault(vaultPath: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await pushToRemote(vaultPath)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Set the upstream and push: `git push -u origin <branch>`. */
export async function publishBranch(vaultPath: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const git = simpleGit(vaultPath)
    const branch = (await git.status()).current ?? 'main'
    await git.push(['-u', 'origin', branch])
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** The vault's `origin` remote URL, or null if none is configured. */
export async function getVaultRemote(vaultPath: string): Promise<string | null> {
  try {
    const remotes = await simpleGit(vaultPath).getRemotes(true)
    const origin = remotes.find((r) => r.name === 'origin') ?? remotes[0]
    return origin?.refs.fetch || origin?.refs.push || null
  } catch {
    return null
  }
}
