import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { simpleGit } from 'simple-git'
import { VaultManager } from '@signoff/vault-core'
import {
  listVaults,
  createVault,
  openExistingVault,
  listFeatures,
  readDocument,
  getDocumentApproval,
  reviewAction,
  readDocComments,
  addCommentThread,
  addCommentReply,
  setCommentResolved,
  readProjectClaudeMd,
  publishBranch,
  getVaultStatus,
  writeVaultWorkflows,
  readVaultWorkflows,
  isDocumentStale,
  syncVault,
  connectRemote,
  cloneVault as cloneVaultBridge,
  getSyncStateBridge,
  listCategoriesBridge,
  upsertCategoryBridge,
  removeCategoryBridge,
  setFeatureCategoryBridge,
  setFeatureTagsBridge,
} from '../src/main/vault-bridge.js'

let tmpDir: string
let vaultPath: string

/**
 * Seed a document into the project tree (not the vault) and register it in the
 * manifest via submitForReview. The vault lives at <tmpDir>/project/.signoff and
 * the project root is <tmpDir>/project so relative paths resolve correctly.
 */
async function seedDoc(feature: string, type: 'spec' | 'plan', content = `# ${feature}\n`) {
  const projectRoot = path.dirname(vaultPath)
  const rel = `docs/${type}s/${feature}.md`
  await fs.mkdir(path.dirname(path.join(projectRoot, rel)), { recursive: true })
  await fs.writeFile(path.join(projectRoot, rel), content)
  const vault = await VaultManager.open(vaultPath)
  await vault.submitForReview(feature, type, rel, 'dev@org.com', 'Dev')
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signoff-desktop-test-'))
  // Vault is at <tmpDir>/project/.signoff so project root is <tmpDir>/project
  await fs.mkdir(path.join(tmpDir, 'project'), { recursive: true })
  vaultPath = path.join(tmpDir, 'project', '.signoff')
  process.env.SIGNOFF_HOME = path.join(tmpDir, '.signoff')
  await VaultManager.create(vaultPath, 'test-project', 'test-org')
  // Set a stable local git identity so reviewer keys are deterministic across machines
  await simpleGit(vaultPath).addConfig('user.email', 'dev@org.com')
  await simpleGit(vaultPath).addConfig('user.name', 'Dev')
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
  delete process.env.SIGNOFF_HOME
})

describe('listVaults', () => {
  it('returns empty array on fresh registry', async () => {
    // createVault auto-registers; create a clean env
    const cleanDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signoff-list-'))
    process.env.SIGNOFF_HOME = path.join(cleanDir, '.signoff')
    const result = await listVaults()
    expect(result).toEqual([])
    await fs.rm(cleanDir, { recursive: true, force: true })
    process.env.SIGNOFF_HOME = path.join(tmpDir, '.signoff')
  })
})

describe('createVault', () => {
  it('creates .signoff in the project root, gitignores it, and registers it', async () => {
    const projectRoot = path.join(tmpDir, 'my-project')
    await fs.mkdir(projectRoot, { recursive: true })
    const result = await createVault(projectRoot, 'my-project')

    const vaultDir = path.join(projectRoot, '.signoff')
    expect(result.name).toBe('my-project')
    expect(result.path).toBe(vaultDir)

    // vault exists at <project>/.signoff
    expect((await fs.stat(path.join(vaultDir, 'config.json'))).isFile()).toBe(true)
    // parent project gitignores the vault
    const gitignore = await fs.readFile(path.join(projectRoot, '.gitignore'), 'utf-8')
    expect(gitignore).toContain('.signoff/')
    // registered at the .signoff dir
    const vaults = await listVaults()
    expect(vaults.some((v) => v.path === vaultDir)).toBe(true)
  })
})

describe('categories & tags', () => {
  it('assigns a category to a feature and resolves it in listFeatures', async () => {
    await seedDoc('user-auth', 'spec')
    await upsertCategoryBridge(vaultPath, { id: 'backend', name: 'Backend', color: 'blue' })
    await setFeatureCategoryBridge(vaultPath, 'user-auth', 'backend')
    await setFeatureTagsBridge(vaultPath, 'user-auth', ['security'])
    const features = await listFeatures(vaultPath)
    const f = features.find((x) => x.name === 'user-auth')!
    expect(f.category).toEqual({ id: 'backend', name: 'Backend', color: 'blue' })
    expect(f.tags).toEqual(['security'])
  })

  it('removeCategoryBridge clears the category off features', async () => {
    await seedDoc('user-auth', 'spec')
    await upsertCategoryBridge(vaultPath, { id: 'backend', name: 'Backend', color: 'blue' })
    await setFeatureCategoryBridge(vaultPath, 'user-auth', 'backend')
    await removeCategoryBridge(vaultPath, 'backend')
    expect(await listCategoriesBridge(vaultPath)).toHaveLength(0)
    const f = (await listFeatures(vaultPath)).find((x) => x.name === 'user-auth')!
    expect(f.category).toBeNull()
  })
})

describe('openExistingVault', () => {
  it('returns config for an existing vault and registers it', async () => {
    const config = await openExistingVault(vaultPath)
    expect(config.name).toBe('test-project')
    const vaults = await listVaults()
    expect(vaults.some(v => v.path === vaultPath)).toBe(true)
  })

  it('throws if path is not a vault', async () => {
    await expect(openExistingVault(path.join(tmpDir, 'notavault'))).rejects.toThrow()
  })

  it('surfaces a warning when the vault is left mid-rebase', async () => {
    // simulate a stuck rebase: git leaves a .git/rebase-merge dir behind
    await fs.mkdir(path.join(vaultPath, '.git', 'rebase-merge'), { recursive: true })
    const result = await openExistingVault(vaultPath)
    expect(result.warning).toMatch(/mid-rebase/i)
  })
})

describe('listFeatures', () => {
  it('returns empty array when no features exist', async () => {
    const result = await listFeatures(vaultPath)
    expect(result).toEqual([])
  })

  it('returns feature with spec status after publish', async () => {
    await seedDoc('user-auth', 'spec')
    const result = await listFeatures(vaultPath)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('user-auth')
    expect(result[0].spec).toBe('pending')
    expect(result[0].plan).toBe('not_found')
  })
})

describe('syncVault picks up newly added documents', () => {
  it('registers a doc added to docs/ after vault creation', async () => {
    const projectRoot = path.dirname(vaultPath)
    const rel = 'docs/specs/audit-log.md'
    await fs.mkdir(path.dirname(path.join(projectRoot, rel)), { recursive: true })
    await fs.writeFile(path.join(projectRoot, rel), '# Audit Log\n')

    // Not registered until a sync runs.
    expect((await listFeatures(vaultPath)).find((f) => f.name === 'audit-log')).toBeUndefined()

    // No upstream here, so the pull rejects; detection still runs in the finally.
    await syncVault(vaultPath).catch(() => {})

    const audit = (await listFeatures(vaultPath)).find((f) => f.name === 'audit-log')
    expect(audit?.spec).toBe('pending')
  })

  it('leaves an already-registered document untouched', async () => {
    await seedDoc('user-auth', 'spec')
    const before = (await listFeatures(vaultPath)).find((f) => f.name === 'user-auth')
    await syncVault(vaultPath).catch(() => {})
    const after = (await listFeatures(vaultPath)).find((f) => f.name === 'user-auth')
    expect(after?.spec).toBe(before?.spec)
  })
})

describe('readDocument', () => {
  it('returns the project file content (not a vault copy)', async () => {
    await seedDoc('user-auth', 'spec', '# Auth Spec\n\nContent here.\n')
    const content = await readDocument(vaultPath, 'user-auth', 'spec')
    expect(content).toBe('# Auth Spec\n\nContent here.\n')
    // The document must NOT exist as a copy inside the vault's specs/ directory
    const projectRoot = path.dirname(vaultPath)
    const vaultCopy = path.join(vaultPath, 'specs', 'user-auth.md')
    await expect(fs.access(vaultCopy)).rejects.toThrow()
    // The actual file is the project file
    const projectFile = path.join(projectRoot, 'docs', 'specs', 'user-auth.md')
    expect((await fs.stat(projectFile)).isFile()).toBe(true)
  })

  it('throws if document does not exist in manifest', async () => {
    await expect(readDocument(vaultPath, 'user-auth', 'spec')).rejects.toThrow()
  })
})

describe('getDocumentApproval', () => {
  it('returns null when no approval record exists', async () => {
    const result = await getDocumentApproval(vaultPath, 'user-auth', 'spec')
    expect(result).toBeNull()
  })

  it('returns approval record after publish', async () => {
    await seedDoc('user-auth', 'spec')
    const result = await getDocumentApproval(vaultPath, 'user-auth', 'spec')
    expect(result).not.toBeNull()
    expect(result!.status).toBe('pending')
  })
})

describe('git sync of review decisions', () => {
  it('records the decision even when there is no remote (pushed: false)', async () => {
    await seedDoc('user-auth', 'spec')
    await reviewAction(vaultPath, 'user-auth', 'spec', 'start_review')
    const result = await reviewAction(vaultPath, 'user-auth', 'spec', 'approve')
    expect(result.pushed).toBe(false)
    // the decision is still committed locally
    const record = await getDocumentApproval(vaultPath, 'user-auth', 'spec')
    expect(record?.status).toBe('approved')
  })

  it('publishes the branch and pushes decisions to a configured remote', async () => {
    // a bare remote on the local filesystem
    const remotePath = path.join(tmpDir, 'remote.git')
    await simpleGit().init(['--bare', remotePath])
    await simpleGit(vaultPath).addRemote('origin', remotePath)

    await seedDoc('user-auth', 'plan')

    // before upstream is set, push has no target
    const beforeUpstream = await getVaultStatus(vaultPath)
    expect(beforeUpstream.tracking).toBeNull()

    const published = await publishBranch(vaultPath)
    expect(published.ok).toBe(true)

    // now an approval pushes to the remote
    await reviewAction(vaultPath, 'user-auth', 'plan', 'start_review')
    const result = await reviewAction(vaultPath, 'user-auth', 'plan', 'approve')
    expect(result.pushed).toBe(true)

    // the branch now tracks origin and nothing is left unpushed
    const after = await getVaultStatus(vaultPath)
    expect(after.tracking).not.toBeNull()
    expect(after.ahead).toBe(0)
  })
})

describe('createVault doc auto-detection', () => {
  it('registers markdown from docs/ only in the manifest (no copies); ignores .superpowers/', async () => {
    const projectRoot = path.join(tmpDir, 'proj')
    await fs.mkdir(path.join(projectRoot, 'docs', 'specs'), { recursive: true })
    await fs.mkdir(path.join(projectRoot, 'docs', 'plans'), { recursive: true })
    await fs.mkdir(path.join(projectRoot, '.superpowers', 'specs'), { recursive: true })
    await fs.writeFile(path.join(projectRoot, 'docs', 'specs', '2026-06-27-user-auth-design.md'), '# Auth\n')
    await fs.writeFile(path.join(projectRoot, 'docs', 'plans', '2026-06-27-user-auth.md'), '# Auth plan\n')
    // This file lives under .superpowers/ — it must NOT be registered by default
    await fs.writeFile(path.join(projectRoot, '.superpowers', 'specs', '2026-06-27-billing-design.md'), '# Billing\n')

    const result = await createVault(projectRoot, 'proj')

    const features = await listFeatures(result.path)
    const names = features.map((f) => f.name).sort()
    // Only docs/ is scanned — billing (from .superpowers/) must not appear
    expect(names).toEqual(['user-auth'])
    expect(names).not.toContain('billing')
    const userAuth = features.find((f) => f.name === 'user-auth')!
    expect(userAuth.spec).toBe('pending')
    expect(userAuth.plan).toBe('pending')
    // readDocument resolves to the project file content (not a vault copy)
    expect(await readDocument(result.path, 'user-auth', 'spec')).toContain('# Auth')
    // No .md copies should exist in the vault's specs/ or plans/ directories
    const vaultSpecsDir = path.join(result.path, 'specs')
    const vaultPlansDir = path.join(result.path, 'plans')
    await expect(fs.readdir(vaultSpecsDir)).rejects.toThrow()
    await expect(fs.readdir(vaultPlansDir)).rejects.toThrow()
  })
})

describe('writeVaultWorkflows', () => {
  it('persists reviewers and commits', async () => {
    await writeVaultWorkflows(vaultPath, {
      spec: { required_approvers: ['lead@org.com'], min_approvals: 1 },
      plan: { required_approvers: [], min_approvals: 1 },
    })
    const wf = await readVaultWorkflows(vaultPath)
    expect(wf.spec.required_approvers).toEqual(['lead@org.com'])
  })
})

describe('isDocumentStale', () => {
  it('flags a doc stale after it changes post-approval', async () => {
    await seedDoc('user-auth', 'spec', '# v1\n')
    await reviewAction(vaultPath, 'user-auth', 'spec', 'start_review')
    await reviewAction(vaultPath, 'user-auth', 'spec', 'approve')
    expect(await isDocumentStale(vaultPath, 'user-auth', 'spec')).toBe(false)
    const projectRoot = path.dirname(vaultPath)
    await fs.writeFile(path.join(projectRoot, 'docs/specs/user-auth.md'), '# v2\n')
    expect(await isDocumentStale(vaultPath, 'user-auth', 'spec')).toBe(true)
  })

  it('returns false when document is not approved', async () => {
    await seedDoc('user-auth', 'spec', '# v1\n')
    // Not approved yet — isDocumentStale should return false
    expect(await isDocumentStale(vaultPath, 'user-auth', 'spec')).toBe(false)
  })
})

describe('reviewAction', () => {
  it('reviewAction walks start_review -> approve and derives approved (single self-approver)', async () => {
    await seedDoc('user-auth', 'spec', '# v1\n')
    await reviewAction(vaultPath, 'user-auth', 'spec', 'start_review')
    await reviewAction(vaultPath, 'user-auth', 'spec', 'approve')
    const rec = await getDocumentApproval(vaultPath, 'user-auth', 'spec')
    const email = Object.keys(rec!.reviewers)[0]
    expect(rec!.reviewers[email].status).toBe('approved')
  })

  it('reviewAction approve before start_review throws', async () => {
    await seedDoc('user-auth', 'spec')
    await expect(reviewAction(vaultPath, 'user-auth', 'spec', 'approve')).rejects.toThrow()
  })

  it('reviewAction passes the message through to the history entry', async () => {
    await seedDoc('user-auth', 'spec')
    await reviewAction(vaultPath, 'user-auth', 'spec', 'start_review')
    await reviewAction(vaultPath, 'user-auth', 'spec', 'approve', 'LGTM')
    const record = await getDocumentApproval(vaultPath, 'user-auth', 'spec')
    expect(record?.history.at(-1)?.message).toBe('LGTM')
  })

  it('reviewAction start_review with no message leaves message: null on history entry', async () => {
    await seedDoc('user-auth', 'spec')
    await reviewAction(vaultPath, 'user-auth', 'spec', 'start_review')
    const record = await getDocumentApproval(vaultPath, 'user-auth', 'spec')
    expect(record?.history.at(-1)?.message).toBeNull()
  })
})

describe('comments', () => {
  it('add thread, reply, resolve round-trip', async () => {
    await seedDoc('user-auth', 'spec')
    let file = await addCommentThread(vaultPath, 'user-auth', 'spec', 'goals', 12, 'Why this scope?')
    const threadId = file.threads[0].id
    file = await addCommentReply(vaultPath, 'user-auth', 'spec', threadId, 'Because X')
    expect(file.threads[0].comments).toHaveLength(2)
    file = await setCommentResolved(vaultPath, 'user-auth', 'spec', threadId, true)
    expect(file.threads[0].resolved).toBe(true)
    expect((await readDocComments(vaultPath, 'user-auth', 'spec')).threads[0].resolved).toBe(true)
  })
})

describe('readProjectClaudeMd', () => {
  it('returns content when present, null otherwise', async () => {
    const projectRoot = path.dirname(vaultPath)
    expect(await readProjectClaudeMd(vaultPath)).toBeNull()
    await fs.writeFile(path.join(projectRoot, 'CLAUDE.md'), '# Project rules\n')
    expect(await readProjectClaudeMd(vaultPath)).toContain('# Project rules')
  })
})

describe('createVault with approvers', () => {
  it('writes approvers to both spec and plan workflows', async () => {
    const projectRoot = path.join(tmpDir, 'approver-proj')
    await fs.mkdir(projectRoot, { recursive: true })
    const result = await createVault(projectRoot, 'p', ['lead@o.c', 'arch@o.c'])
    const workflows = await readVaultWorkflows(result.path)
    expect(workflows.spec.required_approvers).toEqual(['lead@o.c', 'arch@o.c'])
    expect(workflows.plan.required_approvers).toEqual(['lead@o.c', 'arch@o.c'])
  })
})

describe('createVault onProgress', () => {
  it('calls onProgress with final done===total when docs exist', async () => {
    const projectRoot = path.join(tmpDir, 'progress-test')
    await fs.mkdir(path.join(projectRoot, 'docs'), { recursive: true })
    await fs.writeFile(path.join(projectRoot, 'docs', 'spec-one.md'), '# spec')
    await fs.writeFile(path.join(projectRoot, 'docs', 'spec-two.md'), '# spec2')
    const calls: Array<{ done: number; total: number }> = []
    await createVault(projectRoot, 'progress-proj', [], (done, total) => calls.push({ done, total }))
    expect(calls.length).toBeGreaterThan(0)
    const last = calls[calls.length - 1]
    expect(last.done).toBe(last.total)
  })
})

// helper: clone the test vault to a 2nd working copy that shares the bare remote
async function twoClonesSharingRemote() {
  const remote = path.join(tmpDir, 'remote.git')
  await simpleGit().init(['--bare', remote])
  // give the 1st vault a git identity so membership enforcement passes
  await simpleGit(vaultPath).addConfig('user.email', 'dev@org.com')
  await simpleGit(vaultPath).addConfig('user.name', 'Dev')
  await simpleGit(vaultPath).addRemote('origin', remote)
  await simpleGit(vaultPath).push(['-u', 'origin', (await simpleGit(vaultPath).status()).current ?? 'master'])
  const second = path.join(tmpDir, 'second')
  await simpleGit().clone(remote, second)
  // give the 2nd clone a git identity
  await simpleGit(second).addConfig('user.email', 'rev2@org.com')
  await simpleGit(second).addConfig('user.name', 'Rev Two')
  return second
}

describe('transactional mutations', () => {
  it('two reviewers on the same doc both land via transactional re-apply', async () => {
    // configure two required approvers; seed a doc; publish to a shared remote
    await writeVaultWorkflows(vaultPath, {
      spec: { required_approvers: ['dev@org.com', 'rev2@org.com'], min_approvals: 2 },
      plan: { required_approvers: [], min_approvals: 1 },
    })
    await seedDoc('user-auth', 'spec', '# v1\n')
    const second = await twoClonesSharingRemote()

    // reviewer 1 (dev@org.com) approves via the bridge (transactional: pull→apply→push)
    await reviewAction(vaultPath, 'user-auth', 'spec', 'start_review')
    await reviewAction(vaultPath, 'user-auth', 'spec', 'approve')

    // reviewer 2 approves from the second clone's vault dir
    await reviewAction(second, 'user-auth', 'spec', 'start_review')
    await reviewAction(second, 'user-auth', 'spec', 'approve')

    // reviewer 1 pulls; both reviewer entries are present (no lost write, no conflict)
    await syncVault(vaultPath)
    const rec = await getDocumentApproval(vaultPath, 'user-auth', 'spec')
    expect(Object.keys(rec!.reviewers).sort()).toEqual(['dev@org.com', 'rev2@org.com'])
  })

  it('a mutation with no remote commits locally and reports pushed:false', async () => {
    await seedDoc('user-auth', 'spec')
    const r = await reviewAction(vaultPath, 'user-auth', 'spec', 'start_review')
    expect(r.pushed).toBe(false)
    const rec = await getDocumentApproval(vaultPath, 'user-auth', 'spec')
    expect(rec!.reviewers['dev@org.com'].status).toBe('in_review')
  })
})

describe('connectRemote', () => {
  it('connectRemote adds origin + publishes to a bare remote', async () => {
    const remote = path.join(tmpDir, 'remote.git')
    await simpleGit().init(['--bare', remote])
    const r = await connectRemote(vaultPath, remote)
    expect(r.ok).toBe(true)
    const st = await getSyncStateBridge(vaultPath)
    expect(st.hasRemote).toBe(true)
    expect(st.hasUpstream).toBe(true)
  })
})

describe('cloneVault bridge', () => {
  it('cloneVault clones a published vault into a dir and registers it', async () => {
    const remote = path.join(tmpDir, 'remote2.git')
    await simpleGit().init(['--bare', remote])
    await connectRemote(vaultPath, remote)
    const dest = path.join(tmpDir, 'cloned')
    const opened = await cloneVaultBridge(remote, dest)
    expect(opened.name).toBe('test-project')
    expect((await fs.stat(path.join(dest, 'config.json'))).isFile()).toBe(true)
  })

  it('cloneVault rejects an option-injection URL with a friendly error (no raw throw)', async () => {
    await expect(
      cloneVaultBridge('--upload-pack=touch /tmp/pwned', path.join(tmpDir, 'inject'))
    ).rejects.toThrow(/Couldn't clone that repository/i)
  })

  it('cloneVault on a non-vault repo errors', async () => {
    const plain = path.join(tmpDir, 'plain.git')
    await simpleGit().init(['--bare', plain])
    // a bare repo with one non-config commit
    const seed = path.join(tmpDir, 'seed')
    await simpleGit().clone(plain, seed)
    await fs.writeFile(path.join(seed, 'readme.md'), '# hi\n')
    await simpleGit(seed).add('.')
    await simpleGit(seed).addConfig('user.email', 'a@b.c')
    await simpleGit(seed).addConfig('user.name', 'A')
    await simpleGit(seed).commit('init')
    await simpleGit(seed).push(['-u', 'origin', (await simpleGit(seed).status()).current ?? 'master'])
    await expect(cloneVaultBridge(plain, path.join(tmpDir, 'notvault'))).rejects.toThrow(/not a Signoff vault/i)
  })
})

describe('transact network-degrade and divergent-conflict', () => {
  it('network pull failure mid-transaction: action commits locally, resolves with pushed:false (no throw)', async () => {
    // Set up a real remote so the vault is "online" (hasRemote + hasUpstream)
    const remote = path.join(tmpDir, 'net-remote.git')
    await simpleGit().init(['--bare', remote])
    await simpleGit(vaultPath).addRemote('origin', remote)
    await simpleGit(vaultPath).push(['-u', 'origin', (await simpleGit(vaultPath).status()).current ?? 'master'])

    await seedDoc('net-feature', 'spec')

    // Sabotage the remote to simulate a network error: point origin at a non-existent path
    await simpleGit(vaultPath).remote(['set-url', 'origin', '/nonexistent/path/nowhere.git'])

    // reviewAction should resolve (not throw), degrade to local commit
    const result = await reviewAction(vaultPath, 'net-feature', 'spec', 'start_review')
    expect(result.pushed).toBe(false)
    expect(result.conflict).toBeFalsy()

    // The reviewer entry must be present locally (change not lost)
    const rec = await getDocumentApproval(vaultPath, 'net-feature', 'spec')
    expect(rec?.reviewers['dev@org.com']?.status).toBe('in_review')
  })

  it('push-reject on a single commit: rebases onto the advanced remote and retries (no data loss)', async () => {
    // shared remote; vault1 (vaultPath) is online + tracking
    const remote = path.join(tmpDir, 'race-remote.git')
    await simpleGit().init(['--bare', remote])
    await simpleGit(vaultPath).addRemote('origin', remote)
    await simpleGit(vaultPath).push(['-u', 'origin', (await simpleGit(vaultPath).status()).current ?? 'master'])

    await seedDoc('race-feature', 'spec')
    await simpleGit(vaultPath).push()

    // second clone advances the remote with an UNRELATED commit between
    // vault1's pull and push window
    const second = path.join(tmpDir, 'race-second')
    await simpleGit().clone(remote, second)
    await simpleGit(second).addConfig('user.email', 'rev2@org.com')
    await simpleGit(second).addConfig('user.name', 'Rev Two')
    await fs.writeFile(path.join(second, 'note.txt'), 'remote advance\n')
    await simpleGit(second).add(['note.txt'])
    await simpleGit(second).commit('competing', undefined, { '--author': 'Rev Two <rev2@org.com>' })
    await simpleGit(second).push()

    // vault1's reviewAction: its push will reject (remote advanced); the loop
    // re-pulls/rebases the single review commit and retries → pushed:true
    await reviewAction(vaultPath, 'race-feature', 'spec', 'start_review')
    const result = await reviewAction(vaultPath, 'race-feature', 'spec', 'approve')
    expect(result.conflict).toBeFalsy()

    // the review decision survived (no hard reset discarded it) and the remote
    // advance is integrated
    const rec = await getDocumentApproval(vaultPath, 'race-feature', 'spec')
    expect(rec?.reviewers['dev@org.com']?.status).toBe('approved')
    const after = await getVaultStatus(vaultPath)
    expect(after.ahead).toBe(0)
  })

  it('divergent conflict (ahead>1): reviewAction resolves with conflict:true (not thrown)', async () => {
    // Set up shared remote: vault1 (vaultPath) and vault2
    const remote = path.join(tmpDir, 'div-remote.git')
    await simpleGit().init(['--bare', remote])
    await simpleGit(vaultPath).addRemote('origin', remote)
    await simpleGit(vaultPath).push(['-u', 'origin', (await simpleGit(vaultPath).status()).current ?? 'master'])

    // Clone a second vault
    const second = path.join(tmpDir, 'div-second')
    await simpleGit().clone(remote, second)
    await simpleGit(second).addConfig('user.email', 'rev2@org.com')
    await simpleGit(second).addConfig('user.name', 'Rev Two')

    // Seed doc and publish from vault1
    await seedDoc('div-feature', 'spec')
    // Push seed commit from vault1 so second can see the doc
    await simpleGit(vaultPath).push()

    // Both vault1 and vault2 make a local commit each (simulate overlap):
    // vault1: start_review (local only — disconnect remote first)
    await simpleGit(vaultPath).remote(['set-url', 'origin', '/nonexistent/path/nowhere.git'])
    await reviewAction(vaultPath, 'div-feature', 'spec', 'start_review')

    // Restore remote and make vault2 push a competing change
    await simpleGit(vaultPath).remote(['set-url', 'origin', remote])
    // vault2 also pulls and approves (pushing to remote so remote is ahead of vault1)
    await simpleGit(second).pull(['--rebase'])
    // create a competing commit on second
    const v2SeedDoc = path.join(second, 'docs/specs/div-feature.md')
    // write a note file in vault2 directly to create a competing commit
    const noteFile = path.join(second, 'test-note.txt')
    await fs.writeFile(noteFile, 'competing change\n')
    await simpleGit(second).add(['test-note.txt'])
    await simpleGit(second).commit('competing: note from rev2', undefined, { '--author': 'Rev Two <rev2@org.com>' })
    await simpleGit(second).push()

    // Now vault1 has 1 unpushed commit; attempt another local commit to make ahead=2
    // This simulates the ahead>1 case — make one more local commit without pushing
    const noteFile2 = path.join(vaultPath, 'local-note.txt')
    await fs.writeFile(noteFile2, 'another local change\n')
    await simpleGit(vaultPath).add(['local-note.txt'])
    await simpleGit(vaultPath).commit('local: extra commit', undefined, { '--author': 'Dev <dev@org.com>' })

    // vault1 now has 2 local commits and the remote has advanced: push reject + ahead>1 → conflict returned
    const result = await reviewAction(vaultPath, 'div-feature', 'spec', 'approve')
    expect(result.conflict).toBe(true)
    expect(result.pushed).toBe(false)
  })
})
