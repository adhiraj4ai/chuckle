import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { simpleGit } from 'simple-git'
import {
  VaultManager,
  readApproval,
  writeApproval,
  stageAndCommit,
  pullRebase,
  push,
  getSyncState,
  resetHardToUpstream,
  SyncConflictError,
  readWorkflows,
  getWorkflowForType,
  getApprovalStatus,
  listFeatureNames,
  inferFeatureName,
  approvalRelPath,
  readManifest,
  resolveDocPath,
  hashContent,
  isStale,
  migrateToIndex,
  applyReviewerAction,
  deriveStatus,
  projectRootOf,
  readComments,
  writeComments,
  addThread,
  addReply,
  setResolved,
  commentsRelPath,
  addRemote,
  publishBranch as corePublishBranch,
  cloneVault as coreCloneVault,
  classifyGitError,
  type VaultInfo,
  type VaultWorkflows,
  type ApprovalRecord,
  type DocumentType,
  type ReviewAction,
  type CommentsFile,
  type GitErrorKind,
  type SyncState,
} from '@signoff/vault-core'
import type { FeatureEntry, GitCommit, GitStatus, ReviewResult, VaultOpenResult } from '../shared/ipc-types.js'

/** True when a remote is configured AND the branch tracks it. */
async function isOnline(vaultPath: string): Promise<boolean> {
  const s = await getSyncState(vaultPath)
  return s.hasRemote && s.hasUpstream
}

function isPushReject(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes('rejected') || m.includes('non-fast-forward') || m.includes('failed to push')
}

/**
 * Atomic state mutation: pull latest → re-apply the logical change onto it →
 * commit → push (retry on non-fast-forward rejection). applyFn re-reads the
 * latest state from disk, writes the mutated file(s), and returns the in-repo
 * paths it changed + the commit message.
 *
 * Conflicts are RETURNED (not thrown) so callers can surface a resync prompt.
 * A non-conflict pull failure degrades to a local-only commit so the user's
 * action is never lost.
 */
async function transact(
  vaultPath: string,
  applyFn: () => Promise<{ files: string[]; message: string }>,
): Promise<ReviewResult> {
  const online = await isOnline(vaultPath)
  const { name, email } = await resolveVaultAuthor(vaultPath)
  let lastErr = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    if (online) {
      try {
        await pullRebase(vaultPath)
      } catch (e) {
        if (e instanceof SyncConflictError) {
          // rebase conflict — surface it to the caller so the UI can prompt resync
          return { pushed: false, conflict: true, reason: e.message }
        }
        // network/auth/other pull failure → degrade to offline: apply + commit locally
        const { files, message } = await applyFn()
        await stageAndCommit(vaultPath, files, message, email, name)
        return { pushed: false, reason: e instanceof Error ? e.message : String(e) }
      }
    }
    const { files, message } = await applyFn()
    await stageAndCommit(vaultPath, files, message, email, name)
    if (!online) return { pushed: false, reason: 'no remote configured' }
    try {
      await push(vaultPath)
      return { pushed: true }
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err)
      if (!isPushReject(lastErr)) return { pushed: false, reason: lastErr }
      // remote advanced between pull and push; discard our single commit and re-apply on newest
      const ahead = (await getSyncState(vaultPath)).ahead
      if (ahead === 1) {
        await resetHardToUpstream(vaultPath)
      } else {
        // multiple unpushed commits diverged from remote — cannot safely rebase; signal caller
        return { pushed: false, conflict: true, reason: 'local commits diverge from the remote — resync required' }
      }
    }
  }
  return { pushed: false, reason: lastErr }
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
 *  its `.signoff/`; an already-vault dir is used directly. */
async function resolveVaultDir(selected: string): Promise<string> {
  for (const name of [VAULT_DIR]) {
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

/** Recursively collect .md files under a directory (ignoring nested .signoff). */
async function walkMarkdown(dir: string): Promise<string[]> {
  const out: string[] = []
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name === '.signoff' || e.name === '.git' || e.name === 'node_modules') continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walkMarkdown(full)))
    else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(full)
  }
  return out
}

/** Detect the project's existing docs (docs/) and register each
 *  markdown file in the vault manifest by project-relative path — no copy made. */
async function importProjectDocs(
  projectRoot: string,
  vaultDir: string,
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  const { name, email } = await resolveVaultAuthor(vaultDir)
  const vault = await VaultManager.open(vaultDir)
  const cfgRoots = vault.config.doc_roots ?? ['docs']
  // Collect all markdown files upfront so total is known before processing
  const allFiles: string[] = []
  for (const root of cfgRoots) {
    allFiles.push(...(await walkMarkdown(path.join(projectRoot, root))))
  }
  const total = allFiles.length
  if (total === 0) {
    if (onProgress) onProgress(0, 0)
    return 0
  }
  let count = 0
  let done = 0
  for (const file of allFiles) {
    try {
      const rel = path.relative(projectRoot, file).split(path.sep).join('/')
      const type = classifyDoc(rel)
      const feature = inferFeatureName(path.basename(file))
      if (!feature) {
        done++
        if (onProgress) onProgress(done, total)
        continue
      }
      await vault.submitForReview(feature, type, rel, email, name)
      count++
    } catch {
      /* skip a doc that fails to import; setup still completes */
    }
    done++
    if (onProgress) onProgress(done, total)
  }
  return count
}

export async function createVault(
  projectRoot: string,
  name: string,
  approvers?: string[],
  onProgress?: (done: number, total: number) => void
): Promise<VaultOpenResult> {
  const vaultDir = path.join(projectRoot, VAULT_DIR)
  const manager = await VaultManager.create(vaultDir, name)
  await ensureGitignored(projectRoot)
  // Detect and register the project's existing docs so the vault isn't empty.
  // Best-effort: a doc-import failure must not abort setup.
  try {
    await importProjectDocs(projectRoot, vaultDir, onProgress)
  } catch {
    /* ignore — vault is created; docs can be added later */
  }
  // Write approvers to workflows before registering, so a registered vault always
  // reflects the requested approvers. A failed approver write rejects without
  // registering; the .signoff dir on disk can be opened/retried later.
  const clean = [...new Set((approvers ?? []).map((a) => a.trim()).filter(Boolean))]
  if (clean.length) {
    const workflows = await readWorkflows(vaultDir)
    workflows.spec.required_approvers = clean
    workflows.plan.required_approvers = clean
    await writeVaultWorkflows(vaultDir, workflows)
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
  // Migrate legacy docs-as-vault layout to index-by-path (best-effort)
  try { await migrateToIndex(vaultDir) } catch { /* best-effort */ }
  const manager = await VaultManager.open(vaultDir)
  try {
    if ((await getSyncState(vaultDir)).hasUpstream) await pullRebase(vaultDir)
  } catch { /* offline/conflict surfaced later */ }
  await VaultManager.registerVault({
    name: manager.config.name,
    path: vaultDir,
    last_opened: new Date().toISOString(),
  })
  return { name: manager.config.name, path: vaultDir }
}

export async function syncVault(vaultPath: string): Promise<void> {
  await pullRebase(vaultPath)
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
  const abs = resolveDocPath(vaultPath, await readManifest(vaultPath), feature, type)
  if (!abs) throw new Error(`no ${type} registered for ${feature}`)
  return fs.readFile(abs, 'utf-8')
}

export async function getDocumentApproval(
  vaultPath: string,
  feature: string,
  type: DocumentType
): Promise<ApprovalRecord | null> {
  return readApproval(vaultPath, feature, type)
}

/** Write the real project file. Content lives in the project repo, not the vault repo.
 *  Returns { pushed: false } — nothing to push for vault. */
export async function writeDocument(
  vaultPath: string,
  feature: string,
  type: DocumentType,
  content: string
): Promise<ReviewResult> {
  const abs = resolveDocPath(vaultPath, await readManifest(vaultPath), feature, type)
  if (!abs) throw new Error(`no ${type} registered for ${feature}`)
  await fs.writeFile(abs, content)
  // Content lives in the project repo, not the vault — nothing to push here.
  return { pushed: false, reason: 'document saved to the project; not part of the vault repo' }
}

export async function reviewAction(
  vaultPath: string,
  feature: string,
  type: DocumentType,
  action: ReviewAction,
  message?: string | null
): Promise<ReviewResult> {
  const { email } = await resolveVaultAuthor(vaultPath)
  // enforcement: when a required list exists, only its members may act (before the transaction)
  let required: string[] = []
  try { required = getWorkflowForType(await readWorkflows(vaultPath), type).required_approvers } catch { required = [] }
  if (required.length && !required.includes(email)) {
    throw new Error(`only ${required.join(', ')} may review ${feature}/${type}`)
  }
  return transact(vaultPath, async () => {
    const record = await readApproval(vaultPath, feature, type)
    if (!record) throw new Error(`no approval record for ${feature}/${type}`)
    const abs = resolveDocPath(vaultPath, await readManifest(vaultPath), feature, type)
    let hash: string | undefined
    try { hash = abs ? hashContent(await fs.readFile(abs)) : undefined } catch { hash = undefined }
    let updated = applyReviewerAction(record, email, action, new Date().toISOString(), hash, message ?? null)
    updated = { ...updated, status: deriveStatus(updated, required, hash ?? null) }
    await writeApproval(vaultPath, updated)
    return { files: [approvalRelPath(feature, type)], message: `review: ${action} ${feature}/${type} by ${email}` }
  })
}

export async function readDocComments(vaultPath: string, feature: string, type: DocumentType): Promise<CommentsFile> {
  return readComments(vaultPath, feature, type)
}

export async function addCommentThread(vaultPath: string, feature: string, type: DocumentType, section: string, line: number, body: string): Promise<CommentsFile> {
  const { email } = await resolveVaultAuthor(vaultPath)
  let out!: CommentsFile
  const result = await transact(vaultPath, async () => {
    out = addThread(await readComments(vaultPath, feature, type), {
      id: randomUUID(), section, line, resolved: false,
      comments: [{ id: randomUUID(), by: email, at: new Date().toISOString(), body }],
    })
    await writeComments(vaultPath, feature, type, out)
    return { files: [commentsRelPath(feature, type)], message: `comment: add thread on ${feature}/${type}` }
  })
  // If a sync conflict prevented the applyFn from running, out was never assigned — surface it.
  if (result.conflict) throw new SyncConflictError(result.reason ?? 'sync conflict')
  return out
}

export async function addCommentReply(vaultPath: string, feature: string, type: DocumentType, threadId: string, body: string): Promise<CommentsFile> {
  const { email } = await resolveVaultAuthor(vaultPath)
  let out!: CommentsFile
  const result = await transact(vaultPath, async () => {
    out = addReply(await readComments(vaultPath, feature, type), threadId, { id: randomUUID(), by: email, at: new Date().toISOString(), body })
    await writeComments(vaultPath, feature, type, out)
    return { files: [commentsRelPath(feature, type)], message: `comment: reply on ${feature}/${type}` }
  })
  if (result.conflict) throw new SyncConflictError(result.reason ?? 'sync conflict')
  return out
}

export async function setCommentResolved(vaultPath: string, feature: string, type: DocumentType, threadId: string, resolved: boolean): Promise<CommentsFile> {
  let out!: CommentsFile
  const result = await transact(vaultPath, async () => {
    out = setResolved(await readComments(vaultPath, feature, type), threadId, resolved)
    await writeComments(vaultPath, feature, type, out)
    return { files: [commentsRelPath(feature, type)], message: `comment: ${resolved ? 'resolve' : 'reopen'} thread on ${feature}/${type}` }
  })
  if (result.conflict) throw new SyncConflictError(result.reason ?? 'sync conflict')
  return out
}

export async function readProjectClaudeMd(vaultPath: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(projectRootOf(vaultPath), 'CLAUDE.md'), 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

export async function readVaultWorkflows(vaultPath: string): Promise<VaultWorkflows> {
  return readWorkflows(vaultPath)
}

/** Write and commit the vault's workflows.json.
 *  Commits locally only (no transaction/push) — the next mutation's pull integrates this change. */
export async function writeVaultWorkflows(vaultPath: string, workflows: VaultWorkflows): Promise<void> {
  await fs.writeFile(path.join(vaultPath, 'workflows.json'), JSON.stringify(workflows, null, 2) + '\n')
  const { name, email } = await resolveVaultAuthor(vaultPath)
  await stageAndCommit(vaultPath, ['workflows.json'], 'chore: update reviewers', email, name)
}

/** True when the approved document has changed since the approval was recorded. */
export async function isDocumentStale(vaultPath: string, feature: string, type: DocumentType): Promise<boolean> {
  const record = await readApproval(vaultPath, feature, type)
  if (!record) return false
  const abs = resolveDocPath(vaultPath, await readManifest(vaultPath), feature, type)
  if (!abs) return false
  try {
    return isStale(record, hashContent(await fs.readFile(abs)))
  } catch {
    return false
  }
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
export async function pushVault(vaultPath: string): Promise<{ ok: boolean; error?: string; errorKind?: GitErrorKind }> {
  try {
    await push(vaultPath)
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg, errorKind: classifyGitError(msg) }
  }
}

/** Set the upstream and push: `git push -u origin <branch>`.
 *  Delegates to vault-core's hardened wrapper (GIT_TERMINAL_PROMPT=0, unsafe flags). */
export async function publishBranch(vaultPath: string): Promise<{ ok: boolean; error?: string; errorKind?: GitErrorKind }> {
  try {
    await corePublishBranch(vaultPath)
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg, errorKind: classifyGitError(msg) }
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

/** Add a remote and publish the current branch to it (sets upstream). */
export async function connectRemote(
  vaultPath: string,
  url: string,
): Promise<{ ok: boolean; error?: string; errorKind?: GitErrorKind }> {
  try {
    await addRemote(vaultPath, url)
    await corePublishBranch(vaultPath)
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg, errorKind: classifyGitError(msg) }
  }
}

/** Clone a remote vault and register it in the local registry. */
export async function cloneVault(url: string, destDir: string): Promise<VaultOpenResult> {
  await coreCloneVault(url, destDir)
  let manager
  try {
    manager = await VaultManager.open(destDir)
  } catch {
    throw new Error('That repository is not a Signoff vault.')
  }
  await VaultManager.registerVault({ name: manager.config.name, path: destDir, last_opened: new Date().toISOString() })
  return { name: manager.config.name, path: destDir }
}

/** Return the current sync state for a vault. */
export async function getSyncStateBridge(vaultPath: string): Promise<SyncState> {
  return getSyncState(vaultPath)
}
