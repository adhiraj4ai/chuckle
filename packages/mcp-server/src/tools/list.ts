import { readApproval, listFeatureNames, type DocumentType } from "@chuckle/vault-core";

export interface PendingItem {
  feature: string;
  type: string;
  submitted_at: string;
  submitted_by: string;
}

const DOC_TYPES: DocumentType[] = ["spec", "plan"];

export async function handleList(vaultPath: string): Promise<PendingItem[]> {
  const features = await listFeatureNames(vaultPath);
  const pending: PendingItem[] = [];

  for (const feature of features) {
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
