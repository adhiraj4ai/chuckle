import fs from "node:fs/promises";
import path from "node:path";
import type {
  ApprovalRecord,
  ApprovalHistoryEntry,
  ApprovalStatus,
  DocumentType,
  CheckApprovalResult,
  ApprovalMode,
} from "./types.js";
import { deriveStatus } from "./review.js";
import { readWorkflows, getWorkflowForType } from "./workflow.js";
import { readManifest, resolveDocPath, hashContent } from "./manifest.js";
import { hasDiagram } from "./diagram.js";
import { normalizeTier, tierGatingArtifact, tierForcesUnanimous, type Tier } from "./tiers.js";
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
  type: DocumentType,
  opts?: { forceMode?: ApprovalMode }
): Promise<CheckApprovalResult> {
  const record = await readApproval(vaultPath, feature, type);
  if (!record) return { status: "not_found" };

  let required: string[] | null = null;
  let mode: ApprovalMode | undefined;
  let minApprovals = 1;
  let requireDiagram = false;
  try {
    const wf = getWorkflowForType(await readWorkflows(vaultPath), type);
    required = wf.required_approvers;
    mode = wf.approval_mode;
    minApprovals = wf.min_approvals ?? 1;
    requireDiagram = wf.require_diagram === true;
  } catch {
    required = null;
  }
  let currentHash: string | null = null;
  let content: string | null = null;
  try {
    const abs = resolveDocPath(vaultPath, await readManifest(vaultPath), feature, type);
    if (abs) {
      const buf = await fs.readFile(abs);
      currentHash = hashContent(buf);
      content = buf.toString("utf-8");
    }
  } catch {
    currentHash = null;
    content = null;
  }

  // Fail closed: if a diagram is required but content couldn't be read, treat the
  // requirement as UNMET (we cannot prove a diagram exists).
  const diagramOk = !requireDiagram || (content !== null && hasDiagram(content));
  const missing_diagram = requireDiagram && !diagramOk;

  const status = deriveStatus(record, required, currentHash, {
    mode: opts?.forceMode ?? mode, minApprovals, diagramOk,
  });
  if (status === "approved") {
    const approvedEntry = [...record.history].reverse().find((e) => e.action === "approved");
    return { status, approved_by: approvedEntry?.by, approved_at: approvedEntry?.at, ...(missing_diagram ? { missing_diagram } : {}) };
  }
  return { status, ...(missing_diagram ? { missing_diagram } : {}) };
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

export interface CodeClearance {
  cleared: boolean;
  tier: Tier;
  artifact: DocumentType;
  status: ApprovalStatus | "not_found";
}

/** The single source of truth for "may code proceed for this feature?" — used by
 *  both the local hook and the CI check. Reads the feature's tier, gates on the
 *  tier's artifact, and forces unanimous for heavy. Fail-closed via getApprovalStatus. */
export async function isClearedForCode(vaultPath: string, feature: string): Promise<CodeClearance> {
  const manifest = await readManifest(vaultPath);
  const tier = normalizeTier(manifest.features[feature]?.tier);
  const artifact = tierGatingArtifact(tier);
  const res = await getApprovalStatus(
    vaultPath, feature, artifact,
    tierForcesUnanimous(tier) ? { forceMode: "unanimous" } : undefined
  );
  return { cleared: res.status === "approved", tier, artifact, status: res.status };
}
