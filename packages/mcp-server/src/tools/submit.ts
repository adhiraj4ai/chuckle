import {
  VaultManager,
  type DocumentType,
  type PublishResult,
} from "@chuckle/vault-core";
import { resolveGitAuthor } from "./git-author.js";

/**
 * Submit a document that already lives in the vault (specs/ or plans/) for
 * review — no copy. Records the approval entry and commits.
 */
export async function handleSubmit(
  vaultPath: string,
  args: unknown
): Promise<PublishResult> {
  if (typeof args !== "object" || args === null) {
    throw new Error("args must be a plain object");
  }
  const { feature_name, document_type, document_path } = args as Record<string, unknown>;
  if (typeof feature_name !== "string" || feature_name.length === 0) {
    throw new Error("feature_name must be a non-empty string");
  }
  if (document_type !== "spec" && document_type !== "plan") {
    throw new Error(
      `document_type must be "spec" or "plan", got: ${String(document_type)}`
    );
  }
  if (typeof document_path !== "string" || document_path.length === 0) {
    throw new Error("document_path must be a non-empty string (project-relative path to the doc)");
  }

  const { name, email } = await resolveGitAuthor(vaultPath);
  const vault = await VaultManager.open(vaultPath);
  return vault.submitForReview(feature_name, document_type as DocumentType, document_path, email, name);
}
