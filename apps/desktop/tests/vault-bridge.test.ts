import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { simpleGit } from 'simple-git'
import { VaultManager } from '@chuckle/vault-core'
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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chuckle-desktop-test-'))
  // Vault is at <tmpDir>/project/.signoff so project root is <tmpDir>/project
  await fs.mkdir(path.join(tmpDir, 'project'), { recursive: true })
  vaultPath = path.join(tmpDir, 'project', '.signoff')
  process.env.CHUCKLE_HOME = path.join(tmpDir, '.chuckle')
  await VaultManager.create(vaultPath, 'test-project', 'test-org')
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
  delete process.env.CHUCKLE_HOME
})

describe('listVaults', () => {
  it('returns empty array on fresh registry', async () => {
    // createVault auto-registers; create a clean env
    const cleanDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chuckle-list-'))
    process.env.CHUCKLE_HOME = path.join(cleanDir, '.chuckle')
    const result = await listVaults()
    expect(result).toEqual([])
    await fs.rm(cleanDir, { recursive: true, force: true })
    process.env.CHUCKLE_HOME = path.join(tmpDir, '.chuckle')
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
