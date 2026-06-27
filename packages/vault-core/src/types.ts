export type DocumentType = "spec" | "plan";

export type ApprovalAction =
  | "submitted"
  | "approved"
  | "rejected"
  | "resubmitted";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "not_found";

export interface ApprovalHistoryEntry {
  action: ApprovalAction;
  by: string;       // git commit email of the actor
  at: string;       // ISO 8601 UTC
  message: string | null;
}

export interface ApprovalRecord {
  document: string;           // e.g. "spec.md"
  feature: string;            // e.g. "user-auth"
  type: DocumentType;
  workflow: string;           // workflow key used, e.g. "spec"
  status: ApprovalStatus;
  history: ApprovalHistoryEntry[];
}

export interface WorkflowConfig {
  required_approvers: string[];   // git emails
  optional_approvers?: string[];
  min_approvals: number;
}

export interface VaultWorkflows {
  spec: WorkflowConfig;
  plan: WorkflowConfig;
}

export interface VaultConfig {
  name: string;
  org?: string;         // optional, legacy; not used by the docs-as-vault flow
  created_at: string;   // ISO 8601 UTC
}

export interface VaultInfo {
  name: string;
  path: string;           // absolute path to vault directory
  last_opened: string;    // ISO 8601 UTC
}

export interface VaultsRegistry {
  vaults: VaultInfo[];
}

export interface PublishResult {
  vault_path: string;
  document_path: string;
  commit_sha: string;
}

export interface CheckApprovalResult {
  status: ApprovalStatus;
  approved_by?: string;
  approved_at?: string;
}
