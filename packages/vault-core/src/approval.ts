import fs from "node:fs/promises";
import path from "node:path";
import type {
  ApprovalRecord,
  ApprovalHistoryEntry,
  ApprovalStatus,
  DocumentType,
  CheckApprovalResult,
} from "./types.js";
import { deriveStatus } from "./review.js";
import { readWorkflows, getWorkflowForType } from "./workflow.js";
import { readManifest, resolveDocPath, hashContent } from "./manifest.js";
import { validateFeatureName } from "./feature.js";
import { writeJsonAtomic, parseJsonOrThrow } from "./fsutil.js";

export function approvalFilePath(
  vaultPath: string,
  feature: string,
  type: DocumentType
): string {
  validateFeatureName(feature);
  return path.join(vaultPath, "approvals", `${feature}.${type}.json`);
}

export async function readApproval(
  vaultPath: string,
  feature: string,
  type: DocumentType
): Promise<ApprovalRecord | null> {
  const filePath = approvalFilePath(vaultPath, feature, type);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  return parseJsonOrThrow<ApprovalRecord>(raw, filePath);
}

export async function writeApproval(
  vaultPath: string,
  record: ApprovalRecord
): Promise<void> {
  const filePath = approvalFilePath(vaultPath, record.feature, record.type);
  await writeJsonAtomic(filePath, record);
}

const actionToStatus: Record<ApprovalHistoryEntry["action"], ApprovalStatus> = {
  submitted: "pending",
  resubmitted: "pending",
  started_review: "in_review",
  approved: "approved",
  requested_changes: "rejected",
  reopened: "in_review",
};

export function appendHistory(
  record: ApprovalRecord,
  entry: ApprovalHistoryEntry
): ApprovalRecord {
  return {
    ...record,
    status: actionToStatus[entry.action],
    history: [...record.history, entry],
  };
}

export async function getApprovalStatus(
  vaultPath: string,
  feature: string,
  type: DocumentType
): Promise<CheckApprovalResult> {
  const record = await readApproval(vaultPath, feature, type);
  if (!record) return { status: "not_found" };

  // null = required-approver set is UNKNOWN (workflow missing/corrupt). Fail
  // closed: deriveStatus must never return "approved" when this is null.
  let required: string[] | null = null;
  try {
    required = getWorkflowForType(await readWorkflows(vaultPath), type).required_approvers;
  } catch {
    required = null;
  }
  let currentHash: string | null = null;
  try {
    const abs = resolveDocPath(vaultPath, await readManifest(vaultPath), feature, type);
    if (abs) currentHash = hashContent(await fs.readFile(abs));
  } catch {
    currentHash = null;
  }

  const status = deriveStatus(record, required, currentHash);
  if (status === "approved") {
    const approvedEntry = [...record.history].reverse().find((e) => e.action === "approved");
    return { status, approved_by: approvedEntry?.by, approved_at: approvedEntry?.at };
  }
  return { status };
}

/**
 * True when the record is approved but the document has changed since the
 * approval. A legacy approved entry without a content_hash is treated as
 * current (staleness unknown).
 */
export function isStale(record: ApprovalRecord, currentHash: string): boolean {
  if (record.status !== "approved") return false;
  const approved = [...record.history].reverse().find((e) => e.action === "approved");
  if (!approved?.content_hash) return false;
  return approved.content_hash !== currentHash;
}
