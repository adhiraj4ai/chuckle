export type DocumentType = "spec" | "plan";

export type ApprovalAction =
  | "submitted"
  | "resubmitted"
  | "started_review"
  | "approved"
  | "requested_changes"
  | "reopened";

export type ApprovalStatus =
  | "pending"
  | "in_review"
  | "approved"
  | "rejected"
  | "not_found";

export type ReviewerStatus = "pending" | "in_review" | "approved" | "changes_requested";

export type ApprovalMode = "unanimous" | "threshold";

export interface ReviewerState {
  status: ReviewerStatus;
  at: string;              // ISO 8601 UTC
  content_hash?: string;   // doc hash at approve/request_changes time
}

export interface ApprovalHistoryEntry {
  action: ApprovalAction;
  by: string;       // git commit email of the actor
  at: string;       // ISO 8601 UTC
  message: string | null;
  content_hash?: string;   // sha-256 of the doc bytes when this action was recorded
}

export interface ApprovalRecord {
  document: string;           // e.g. "spec.md"
  feature: string;            // e.g. "user-auth"
  type: DocumentType;
  workflow: string;           // workflow key used, e.g. "spec"
  status: ApprovalStatus;
  reviewers: Record<string, ReviewerState>;
  history: ApprovalHistoryEntry[];
}

export interface WorkflowConfig {
  required_approvers: string[];   // git emails
  optional_approvers?: string[];
  min_approvals: number;
  approval_mode?: ApprovalMode;   // absent ⇒ "unanimous"
}

export interface VaultWorkflows {
  spec: WorkflowConfig;
  plan: WorkflowConfig;
}

export interface VaultConfig {
  name: string;
  org?: string;         // optional, legacy; not used by the docs-as-vault flow
  created_at: string;   // ISO 8601 UTC
  doc_roots?: string[]; // dirs scanned for docs; default ["docs"]
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
  stale?: boolean;
}
