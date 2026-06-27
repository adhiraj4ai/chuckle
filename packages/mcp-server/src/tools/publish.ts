import {
  VaultManager,
  writeActiveFeature,
  type DocumentType,
  type PublishResult,
} from "@chuckle/vault-core";
import { resolveGitAuthor } from "./git-author.js";

export async function handlePublish(
  vaultPath: string,
  args: unknown,
  projectRoot: string = process.cwd()
): Promise<PublishResult> {
  if (typeof args !== "object" || args === null) {
    throw new Error("args must be a plain object");
  }

  const { feature_name, document_type, document_path } = args as Record<
    string,
    unknown
  >;

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

  const resolvedType = document_type as DocumentType;

  const { name, email } = await resolveGitAuthor(vaultPath);
  const vault = await VaultManager.open(vaultPath);
  const result = await vault.submitForReview(feature_name, resolvedType, document_path, email, name);
  // Best-effort pointer write after a successful publish; a write failure here surfaces as a publish error.
  await writeActiveFeature(projectRoot, { feature: feature_name, vaultPath });
  return result;
}
