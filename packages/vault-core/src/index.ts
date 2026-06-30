// Types
export type {
  DocumentType,
  ApprovalAction,
  ApprovalStatus,
  ApprovalHistoryEntry,
  ApprovalRecord,
  ReviewerStatus,
  ReviewerState,
  WorkflowConfig,
  VaultWorkflows,
  VaultConfig,
  VaultInfo,
  VaultsRegistry,
  PublishResult,
  CheckApprovalResult,
  ApprovalMode,
} from "./types.js";

// Feature inference + validation
export { inferFeatureName, validateFeatureName } from "./feature.js";

// Filesystem helpers (atomic writes, guarded JSON parse)
export { writeFileAtomic, writeJsonAtomic, parseJsonOrThrow } from "./fsutil.js";

// Reviewer workflow
export type { ReviewAction } from "./review.js";
export { applyReviewerAction, deriveStatus } from "./review.js";

// Vault layout (docs-as-vault: specs/ plans/ approvals/)
export {
  documentPath,
  documentRelPath,
  approvalRelPath,
  listFeatureNames,
} from "./layout.js";

// Manifest (index-by-path)
export type { Manifest, FeatureDocs } from "./manifest.js";
export {
  manifestRelPath,
  projectRootOf,
  readManifest,
  writeManifest,
  getFeatureDoc,
  setFeatureDoc,
  removeFeatureDoc,
  manifestFeatureNames,
  resolveDocPath,
  hashContent,
} from "./manifest.js";

// Workflow
export { readWorkflows, getWorkflowForType } from "./workflow.js";

// Approval
export {
  approvalFilePath,
  readApproval,
  writeApproval,
  appendHistory,
  getApprovalStatus,
  isStale,
} from "./approval.js";

// Comments
export type { CommentEntry, CommentThread, CommentsFile } from "./comments.js";
export { commentsRelPath, readComments, writeComments, addThread, addReply, setResolved } from "./comments.js";

// Active-feature pointer
export type { ActiveFeature } from "./activeFeature.js";
export { writeActiveFeature, readActiveFeature } from "./activeFeature.js";

// Git
export {
  initVaultRepo, stageAndCommit, pullLatest, pushToRemote, getHeadSha,
  SyncConflictError, classifyGitError, hasRemote, getRemoteUrl, addRemote,
  getCurrentBranch, publishBranch, fetch, pullRebase, push, resetHardToUpstream,
  cloneVault, getSyncState, isRebaseInProgress, validateRemoteUrl,
} from "./git.js";
export type { GitErrorKind, SyncState } from "./git.js";

// VaultManager
export { VaultManager } from "./vault.js";

// Migration (legacy features/ layout -> docs-as-vault; docs-as-vault -> index-by-path)
export { migrateVault, migrateToIndex } from "./migrate.js";
