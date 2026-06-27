import fs from "node:fs/promises";
import path from "node:path";
import type {
  ApprovalRecord,
  ApprovalHistoryEntry,
  ApprovalStatus,
  DocumentType,
  CheckApprovalResult,
} from "./types.js";

export function approvalFilePath(
  vaultPath: string,
  feature: string,
  type: DocumentType
): string {
  return path.join(vaultPath, "approvals", `${feature}.${type}.json`);
}

export async function readApproval(
  vaultPath: string,
  feature: string,
  type: DocumentType
): Promise<ApprovalRecord | null> {
  const filePath = approvalFilePath(vaultPath, feature, type);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as ApprovalRecord;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeApproval(
  vaultPath: string,
  record: ApprovalRecord
): Promise<void> {
  const filePath = approvalFilePath(vaultPath, record.feature, record.type);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(record, null, 2) + "\n", "utf-8");
}

const actionToStatus: Record<ApprovalHistoryEntry["action"], ApprovalStatus> = {
  submitted: "pending",
  resubmitted: "pending",
  approved: "approved",
  rejected: "rejected",
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

  if (record.status === "approved") {
    const approvedEntry = [...record.history]
      .reverse()
      .find((e) => e.action === "approved");
    return {
      status: "approved",
      approved_by: approvedEntry?.by,
      approved_at: approvedEntry?.at,
    };
  }

  return { status: record.status };
}
