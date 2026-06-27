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
  inferFeatureName,
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

/** Remove a vault from the recent-projects list (registry only; disk untouched). */
export async function removeVault(vaultPath: string): Promise<void> {
  return VaultManager.removeVault(vaultPath)
}

const VAULT_DIR = '.signoff'

/** Add `.signoff/` to the project's .gitignore so the vault stays uncommitted there. */
async function ensureGitignored(projectRoot: string): Promise<void> {
  const gitignore = path.join(projectRoot, '.gitignore')
  let content = ''
  try {
    content = await fs.readFile(gitignore, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  if (content.split(/\r?\n/).some((l) => l.trim() === `${VAULT_DIR}/` || l.trim() === VAULT_DIR)) return
  const prefix = content && !content.endsWith('\n') ? content + '\n' : content
  await fs.writeFile(gitignore, `${prefix}${VAULT_DIR}/\n`)
}

/** Resolve a user-picked directory to a vault dir: a project root resolves to
 *  its `.signoff/` (or legacy `.chuckle/`); an already-vault dir is used directly. */
async function resolveVaultDir(selected: string): Promise<string> {
  for (const name of [VAULT_DIR, '.chuckle']) {
    const nested = path.join(selected, name)
    try {
      await fs.access(path.join(nested, 'config.json'))
      return nested
    } catch {
      /* not this one */
    }
  }
  return selected
}

/** Classify a markdown file as spec or plan from its path/filename. */
function classifyDoc(relPath: string): DocumentType {
  const p = relPath.toLowerCase()
  if (/(^|\/)plans?(\/|$)/.test(p) || /plan/.test(path.basename(p))) return 'plan'
  return 'spec'
}

/** Recursively collect .md files under a directory (ignoring nested .chuckle). */
async function walkMarkdown(dir: string): Promise<string[]> {
  const out: string[] = []
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name === '.signoff' || e.name === '.chuckle' || e.name === '.git' || e.name === 'node_modules') continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walkMarkdown(full)))
    else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(full)
  }
  return out
}

/** Detect the project's existing docs (docs/ and .superpowers/) and import each
 *  markdown file into the vault, classified as spec/plan and submitted for review. */
async function importProjectDocs(projectRoot: string, vaultDir: string): Promise<number> {
  const sources = [path.join(projectRoot, 'docs'), path.join(projectRoot, '.superpowers')]
  const { name, email } = await resolveVaultAuthor(vaultDir)
  const vault = await VaultManager.open(vaultDir)
  let count = 0
  for (const src of sources) {
    for (const file of await walkMarkdown(src)) {
      try {
        const type = classifyDoc(path.relative(src, file))
        const feature = inferFeatureName(path.basename(file))
        if (!feature) continue
        await fs.copyFile(file, documentPath(vaultDir, feature, type))
        await vault.submitForReview(feature, type, email, name)
        count++
      } catch {
        /* skip a doc that fails to import; setup still completes */
      }
    }
  }
  return count
}

export async function createVault(projectRoot: string, name: string): Promise<VaultOpenResult> {
  const vaultDir = path.join(projectRoot, VAULT_DIR)
  const manager = await VaultManager.create(vaultDir, name)
  await ensureGitignored(projectRoot)
  // Detect and ingest the project's existing docs so the vault isn't empty.
  // Best-effort: a doc-import failure must not abort setup.
  try {
    await importProjectDocs(projectRoot, vaultDir)
  } catch {
    /* ignore — vault is created; docs can be added later */
  }
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
