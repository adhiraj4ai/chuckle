import {
  getApprovalStatus,
  pullLatest,
  type DocumentType,
  type CheckApprovalResult,
} from "@chuckle/vault-core";

export async function handleCheck(
  vaultPath: string,
  args: unknown
): Promise<CheckApprovalResult> {
  if (typeof args !== "object" || args === null) {
    throw new Error("args must be a plain object");
  }

  const { feature_name, document_type } = args as Record<string, unknown>;

  if (typeof feature_name !== "string" || feature_name.length === 0) {
    throw new Error("feature_name must be a non-empty string");
  }
  if (document_type !== "spec" && document_type !== "plan") {
    throw new Error(
      `document_type must be "spec" or "plan", got: ${String(document_type)}`
    );
  }

  // Pull the latest first so the developer sees the reviewer's newest decision,
  // not a stale local clone. Best-effort: offline / no-remote falls back to local.
  try {
    await pullLatest(vaultPath);
  } catch {
    // no remote / offline — read whatever is local
  }

  const status = await getApprovalStatus(vaultPath, feature_name, document_type as DocumentType);
  return { ...status, stale: false };
}
