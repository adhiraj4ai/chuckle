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
} from '@chuckle/vault-core'

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
}

export interface FeatureEntry {
  name: string
  spec: ApprovalStatus | 'not_found'
  plan: ApprovalStatus | 'not_found'
}

/** Result of creating/opening a vault: the vault's display name and the
 *  resolved vault directory (the project's .chuckle/). */
export interface VaultOpenResult {
  name: string
  path: string
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
 *  whether that commit reached the remote so collaborators can see it. */
export interface ReviewResult {
  pushed: boolean
  reason?: string
}

export type IpcChannels =
  | 'vault:list' | 'vault:remove' | 'vault:create' | 'vault:open-existing' | 'vault:select-directory' | 'vault:sync' | 'vault:get-remote'
  | 'vault:log' | 'vault:status' | 'vault:push' | 'vault:publish-branch' | 'vault:author'
  | 'features:list'
  | 'document:read' | 'document:write' | 'document:get-approval' | 'document:is-stale'
  | 'review:action'
  | 'comments:read' | 'comments:add-thread' | 'comments:add-reply' | 'comments:set-resolved'
  | 'project:read-claude-md'
  | 'workflows:read' | 'workflows:write'
  | 'app:open-external'

export interface ChuckleAPI {
  vault: {
    list(): Promise<VaultInfo[]>
    remove(vaultPath: string): Promise<void>
    create(projectRoot: string, name: string): Promise<VaultOpenResult>
    openExisting(path: string): Promise<VaultOpenResult>
    selectDirectory(): Promise<string | null>
    sync(vaultPath: string): Promise<void>
    getRemote(vaultPath: string): Promise<string | null>
    log(vaultPath: string): Promise<GitCommit[]>
    status(vaultPath: string): Promise<GitStatus>
    push(vaultPath: string): Promise<{ ok: boolean; error?: string }>
    publishBranch(vaultPath: string): Promise<{ ok: boolean; error?: string }>
    author(vaultPath: string): Promise<{ name: string; email: string }>
  }
  features: {
    list(vaultPath: string): Promise<FeatureEntry[]>
  }
  document: {
    read(vaultPath: string, feature: string, type: DocumentType): Promise<string>
    write(vaultPath: string, feature: string, type: DocumentType, content: string): Promise<ReviewResult>
    getApproval(vaultPath: string, feature: string, type: DocumentType): Promise<ApprovalRecord | null>
    isStale(vaultPath: string, feature: string, type: DocumentType): Promise<boolean>
  }
  review: {
    action(vaultPath: string, feature: string, type: DocumentType, action: ReviewAction, message?: string | null): Promise<ReviewResult>
  }
  comments: {
    read(vaultPath: string, feature: string, type: DocumentType): Promise<CommentsFile>
    addThread(vaultPath: string, feature: string, type: DocumentType, section: string, line: number, body: string): Promise<CommentsFile>
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
  openExternal(url: string): Promise<void>
}

// Augment Window so renderer TypeScript knows about window.chuckle
declare global {
  interface Window {
    chuckle: ChuckleAPI
  }
}
