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
  approveDocument,
  rejectDocument,
  publishBranch,
  getVaultStatus,
} from '../src/main/vault-bridge.js'

let tmpDir: string
let vaultPath: string

async function seedDoc(feature: string, type: 'spec' | 'plan', content = `# ${feature}\n`) {
  const src = path.join(tmpDir, `${feature}-${type}.md`)
  await fs.writeFile(src, content)
  const vault = await VaultManager.open(vaultPath)
  await vault.publish(src, feature, type, 'dev@org.com', 'Dev')
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chuckle-desktop-test-'))
  vaultPath = path.join(tmpDir, 'vault')
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
  it('creates vault directory and registers it', async () => {
    const newVaultPath = path.join(tmpDir, 'new-vault')
    const config = await createVault(newVaultPath, 'my-project', 'my-org')
    expect(config.name).toBe('my-project')
    expect(config.org).toBe('my-org')
    const vaults = await listVaults()
    expect(vaults.some(v => v.path === newVaultPath)).toBe(true)
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
  it('returns markdown content of published document', async () => {
    await seedDoc('user-auth', 'spec', '# Auth Spec\n\nContent here.\n')
    const content = await readDocument(vaultPath, 'user-auth', 'spec')
    expect(content).toBe('# Auth Spec\n\nContent here.\n')
  })

  it('throws if document does not exist', async () => {
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

describe('approveDocument', () => {
  it('updates record status to approved and commits', async () => {
    await seedDoc('user-auth', 'spec')
    await approveDocument(vaultPath, 'user-auth', 'spec', 'LGTM')
    const record = await getDocumentApproval(vaultPath, 'user-auth', 'spec')
    expect(record!.status).toBe('approved')
    const lastEntry = record!.history.at(-1)!
    expect(lastEntry.action).toBe('approved')
    expect(lastEntry.message).toBe('LGTM')
  })

  it('throws if no approval record exists to approve', async () => {
    await expect(approveDocument(vaultPath, 'user-auth', 'spec', null)).rejects.toThrow()
  })
})

describe('rejectDocument', () => {
  it('updates record status to rejected and commits', async () => {
    await seedDoc('user-auth', 'spec')
    await rejectDocument(vaultPath, 'user-auth', 'spec', 'Needs more detail')
    const record = await getDocumentApproval(vaultPath, 'user-auth', 'spec')
    expect(record!.status).toBe('rejected')
    const lastEntry = record!.history.at(-1)!
    expect(lastEntry.action).toBe('rejected')
    expect(lastEntry.message).toBe('Needs more detail')
  })
})

describe('git sync of review decisions', () => {
  it('records the decision even when there is no remote (pushed: false)', async () => {
    await seedDoc('user-auth', 'spec')
    const result = await approveDocument(vaultPath, 'user-auth', 'spec', null)
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
    const result = await approveDocument(vaultPath, 'user-auth', 'plan', null)
    expect(result.pushed).toBe(true)

    // the branch now tracks origin and nothing is left unpushed
    const after = await getVaultStatus(vaultPath)
    expect(after.tracking).not.toBeNull()
    expect(after.ahead).toBe(0)
  })
})
