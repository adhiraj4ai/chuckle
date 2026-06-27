// Types
export type {
  DocumentType,
  ApprovalAction,
  ApprovalStatus,
  ApprovalHistoryEntry,
  ApprovalRecord,
  WorkflowConfig,
  VaultWorkflows,
  VaultConfig,
  VaultInfo,
  VaultsRegistry,
  PublishResult,
  CheckApprovalResult,
} from "./types.js";

// Feature inference
export { inferFeatureName } from "./feature.js";

// Vault layout (docs-as-vault: specs/ plans/ approvals/)
export {
  documentPath,
  documentRelPath,
  approvalRelPath,
  listFeatureNames,
} from "./layout.js";

// Workflow
export { readWorkflows, getWorkflowForType } from "./workflow.js";

// Approval
export {
  approvalFilePath,
  readApproval,
  writeApproval,
  appendHistory,
  getApprovalStatus,
} from "./approval.js";

// Active-feature pointer
export type { ActiveFeature } from "./activeFeature.js";
export { writeActiveFeature, readActiveFeature } from "./activeFeature.js";

// Git
export {
  initVaultRepo,
  stageAndCommit,
  pullLatest,
  pushToRemote,
  getHeadSha,
} from "./git.js";

// VaultManager
export { VaultManager } from "./vault.js";

// Migration (legacy features/ layout -> docs-as-vault)
export { migrateVault } from "./migrate.js";
