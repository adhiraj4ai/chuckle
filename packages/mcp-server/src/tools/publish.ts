import {
  VaultManager,
  writeActiveFeature,
  validateFeatureName,
  type DocumentType,
  type PublishResult,
  type Tier,
} from "@signoff/vault-core";
import { resolveGitAuthor } from "./git-author.js";
import { validateDocumentPath } from "./validate-input.js";

export async function handlePublish(
  vaultPath: string,
  args: unknown,
  projectRoot: string = process.cwd()
): Promise<PublishResult> {
  if (typeof args !== "object" || args === null) {
    throw new Error("args must be a plain object");
  }

  const { feature_name, document_type, document_path, category, tags, tier } = args as Record<
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
  validateFeatureName(feature_name);
  if (typeof document_path !== "string" || document_path.length === 0) {
    throw new Error("document_path must be a non-empty string (project-relative path to the doc)");
  }
  validateDocumentPath(document_path, projectRoot);

  const resolvedType = document_type as DocumentType;

  const { name, email } = await resolveGitAuthor(vaultPath);
  const vault = await VaultManager.open(vaultPath);
  const opts: { category?: string; tags?: string[]; tier?: Tier } = {};
  if (typeof category === "string" && category.length) opts.category = category;
  if (Array.isArray(tags)) opts.tags = tags.filter((t): t is string => typeof t === "string");
  if (tier === "light" || tier === "standard" || tier === "heavy") opts.tier = tier as Tier;
  const result = await vault.submitForReview(feature_name, resolvedType, document_path, email, name, opts);
  // Best-effort pointer write after a successful publish; a write failure here surfaces as a publish error.
  await writeActiveFeature(projectRoot, { feature: feature_name, vaultPath });
  return result;
}
