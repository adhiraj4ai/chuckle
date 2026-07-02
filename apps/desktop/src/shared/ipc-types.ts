import type {
  VaultInfo,
  VaultConfig,
  ApprovalRecord,
  ApprovalHistoryEntry,
  VaultWorkflows,
  WorkflowConfig,
  ApprovalStatus,
  ReviewerStatus,
  DocumentType,
  ReviewAction,
  CommentsFile,
  CommentThread,
  CommentEntry,
  GitErrorKind,
  SyncState,
  Category,
  CategoryColor,
  Tier,
  Ticket,
  CheckApprovalResult,
} from '@signoff/vault-core'

export type {
  VaultInfo,
  VaultConfig,
  ApprovalRecord,
  ApprovalHistoryEntry,
  VaultWorkflows,
  WorkflowConfig,
  ApprovalStatus,
  ReviewerStatus,
  DocumentType,
  ReviewAction,
  CommentsFile,
  CommentThread,
  CommentEntry,
  GitErrorKind,
  SyncState,
  Category,
  CategoryColor,
  Tier,
  Ticket,
  CheckApprovalResult,
}

// Value re-exports (runtime helpers shared by main + renderer). Imported from the
// pure `categories` subpath — NOT the package barrel — so the renderer bundle does
// not pull in vault-core's git/simple-git (Node-only) code.
export { CATEGORY_COLORS, slugify, normalizeTags } from '@signoff/vault-core/categories'

// Tier keys as a runtime constant (mirrors vault-core's TIER_KEYS but inlined here
// to avoid pulling in the Node-only vault-core barrel into the renderer bundle).
export const TIER_KEYS: Tier[] = ['light', 'standard', 'heavy']

/** Mirrors vault-core's `AuditEntry`. Duplicated here (not imported from
 *  vault-core) because the renderer bundle must not pull in vault-core's
 *  Node-only barrel — see the CATEGORY_COLORS note above. */
export interface AuditLogEntry {
  v: 1
  session_id: string | null
  ts: string
  actor: string
  feature: string | null
  repo: string
  source: 'gate' | 'mcp'
  tool: string
  decision: 'allow' | 'block'
}

export interface InstallStatus {
  gate: 'not_installed' | 'installed' | 'outdated'
  skill: 'not_installed' | 'installed'
  installedVersion: string | null
  appVersion: string | null
  nodeAvailable: boolean
}

export interface InstallComponents {
  gate: boolean
  skill: boolean
}

export interface FeatureEntry {
  name: string
  spec: ApprovalStatus | 'not_found'
  plan: ApprovalStatus | 'not_found'
  adr: ApprovalStatus | 'not_found'
  category: Category | null
  tags: string[]
  tier: Tier
  ticket: Ticket | null
  /** Project-relative path per doc type (from the manifest), `/`-separated.
   *  Absent for a type the feature does not have. */
  paths: { spec?: string; plan?: string; adr?: string }
}

/** Result of creating/opening a vault: the vault's display name and the
 *  resolved vault directory (the project's .signoff/). */
export interface VaultOpenResult {
  name: string
  path: string
  /** Non-fatal warning surfaced to the user (e.g. a sync left a rebase stuck). */
  warning?: string
}

export interface GitCommit {
  hash: string
  short: string
  message: string
  author: string
  date: string
  refs: string
}

export interface GitStatus {
  branch: string | null
  tracking: string | null
  ahead: number
  behind: number
}

/** Outcome of a review/edit action: it always commits locally; `pushed` says
 *  whether that commit reached the remote so collaborators can see it.
 *  `conflict` is true when a git conflict (rebase overlap or divergent history)
 *  prevented the push — the caller should prompt the user to resync and retry. */
export interface ReviewResult {
  pushed: boolean
  reason?: string
  conflict?: boolean
}

export type IpcChannels =
  | 'vault:list' | 'vault:remove' | 'vault:create' | 'vault:open-existing' | 'vault:select-directory' | 'vault:sync' | 'vault:get-remote'
  | 'vault:log' | 'vault:status' | 'vault:push' | 'vault:publish-branch' | 'vault:author'
  | 'vault:connect-remote' | 'vault:clone' | 'vault:sync-state' | 'vault:connect-claude'
  | 'features:list'
  | 'categories:list' | 'categories:upsert' | 'categories:remove'
  | 'feature:set-category' | 'feature:set-tags' | 'feature:set-tier' | 'feature:set-ticket'
  | 'document:read' | 'document:write' | 'document:get-approval' | 'document:is-stale' | 'document:get-status'
  | 'audit:read'
  | 'review:action'
  | 'comments:read' | 'comments:add-thread' | 'comments:add-reply' | 'comments:set-resolved'
  | 'project:read-claude-md'
  | 'workflows:read' | 'workflows:write'
  | 'app:open-external'
  | 'vault:setup-progress'
  | 'install:status' | 'install:apply' | 'install:remove'

export interface SignoffAPI {
  vault: {
    list(): Promise<VaultInfo[]>
    remove(vaultPath: string): Promise<void>
    create(projectRoot: string, name: string, approvers?: string[]): Promise<VaultOpenResult>
    onSetupProgress(cb: (p: { done: number; total: number }) => void): () => void
    openExisting(path: string): Promise<VaultOpenResult>
    selectDirectory(): Promise<string | null>
    sync(vaultPath: string): Promise<void>
    getRemote(vaultPath: string): Promise<string | null>
    log(vaultPath: string): Promise<GitCommit[]>
    status(vaultPath: string): Promise<GitStatus>
    push(vaultPath: string): Promise<{ ok: boolean; error?: string; errorKind?: GitErrorKind }>
    publishBranch(vaultPath: string): Promise<{ ok: boolean; error?: string; errorKind?: GitErrorKind }>
    author(vaultPath: string): Promise<{ name: string; email: string }>
    connectRemote(vaultPath: string, url: string): Promise<{ ok: boolean; error?: string; errorKind?: GitErrorKind }>
    clone(url: string, destDir: string): Promise<VaultOpenResult>
    syncState(vaultPath: string): Promise<SyncState>
    connectClaude(vaultPath: string): Promise<{ settingsPath: string }>
  }
  features: {
    list(vaultPath: string): Promise<FeatureEntry[]>
    setCategory(vaultPath: string, feature: string, categoryId: string | null): Promise<ReviewResult>
    setTags(vaultPath: string, feature: string, tags: string[]): Promise<ReviewResult>
    setTier(vaultPath: string, feature: string, tier: Tier): Promise<ReviewResult>
    setTicket(vaultPath: string, feature: string, ticket: Ticket | null): Promise<ReviewResult>
  }
  categories: {
    list(vaultPath: string): Promise<Category[]>
    upsert(vaultPath: string, category: Category): Promise<ReviewResult>
    remove(vaultPath: string, id: string): Promise<ReviewResult>
  }
  document: {
    read(vaultPath: string, feature: string, type: DocumentType): Promise<string>
    write(vaultPath: string, feature: string, type: DocumentType, content: string): Promise<ReviewResult>
    getApproval(vaultPath: string, feature: string, type: DocumentType): Promise<ApprovalRecord | null>
    isStale(vaultPath: string, feature: string, type: DocumentType): Promise<boolean>
    getStatus(vaultPath: string, feature: string, type: DocumentType): Promise<CheckApprovalResult>
  }
  audit: {
    read(vaultPath: string, feature?: string): Promise<AuditLogEntry[]>
  }
  review: {
    action(vaultPath: string, feature: string, type: DocumentType, action: ReviewAction, message?: string | null): Promise<ReviewResult>
  }
  comments: {
    read(vaultPath: string, feature: string, type: DocumentType): Promise<CommentsFile>
    addThread(vaultPath: string, feature: string, type: DocumentType, section: string, line: number, body: string, quote?: string): Promise<CommentsFile>
    addReply(vaultPath: string, feature: string, type: DocumentType, threadId: string, body: string): Promise<CommentsFile>
    setResolved(vaultPath: string, feature: string, type: DocumentType, threadId: string, resolved: boolean): Promise<CommentsFile>
  }
  project: {
    readClaudeMd(vaultPath: string): Promise<string | null>
  }
  workflows: {
    read(vaultPath: string): Promise<VaultWorkflows>
    write(vaultPath: string, workflows: VaultWorkflows): Promise<void>
  }
  install: {
    status(vaultPath: string): Promise<InstallStatus>
    apply(vaultPath: string, components: InstallComponents): Promise<InstallStatus>
    remove(vaultPath: string, components: InstallComponents): Promise<InstallStatus>
  }
  /** Open an http(s) URL in the OS browser. Non-http(s) URLs are refused. */
  openExternal(url: string): Promise<{ ok: boolean; error?: string }>
}

// Augment Window so renderer TypeScript knows about window.signoff
declare global {
  interface Window {
    signoff: SignoffAPI
  }
}
