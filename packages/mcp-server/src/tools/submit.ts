import { simpleGit } from "simple-git";
import {
  VaultManager,
  type DocumentType,
  type PublishResult,
} from "@chuckle/vault-core";

async function resolveGitAuthor(
  vaultPath: string
): Promise<{ name: string; email: string }> {
  const git = simpleGit(vaultPath);
  const [nameResult, emailResult] = await Promise.all([
    git.getConfig("user.name"),
    git.getConfig("user.email"),
  ]);
  return {
    name: nameResult.value ?? "Unknown",
    email: emailResult.value ?? "unknown@local",
  };
}

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
  const { feature_name, document_type } = args as Record<string, unknown>;
  if (typeof feature_name !== "string" || feature_name.length === 0) {
    throw new Error("feature_name must be a non-empty string");
  }
  if (document_type !== "spec" && document_type !== "plan") {
    throw new Error(
      `document_type must be "spec" or "plan", got: ${String(document_type)}`
    );
  }

  const { name, email } = await resolveGitAuthor(vaultPath);
  const vault = await VaultManager.open(vaultPath);
  return vault.submitForReview(feature_name, document_type as DocumentType, email, name);
}
