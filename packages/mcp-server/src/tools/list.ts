import fs from "node:fs/promises";
import path from "node:path";
import { readApproval, type DocumentType } from "@chuckle/vault-core";

export interface PendingItem {
  feature: string;
  type: string;
  submitted_at: string;
  submitted_by: string;
}

const DOC_TYPES: DocumentType[] = ["spec", "plan"];

export async function handleList(vaultPath: string): Promise<PendingItem[]> {
  const featuresDir = path.join(vaultPath, "features");
  let entries: string[];
  try {
    entries = await fs.readdir(featuresDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const pending: PendingItem[] = [];

  for (const feature of entries) {
    for (const type of DOC_TYPES) {
      const record = await readApproval(vaultPath, feature, type);
      if (!record || record.status !== "pending") continue;

      const submittedEntry = record.history.find(
        (e) => e.action === "submitted" || e.action === "resubmitted"
      );
      pending.push({
        feature,
        type,
        submitted_at: submittedEntry?.at ?? record.history[0]?.at ?? "",
        submitted_by: submittedEntry?.by ?? record.history[0]?.by ?? "",
      });
    }
  }

  return pending;
}
