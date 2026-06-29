import path from "node:path";
import type { DocumentType } from "./types.js";
import { readManifest, manifestFeatureNames } from "./manifest.js";
import { validateFeatureName } from "./feature.js";

/** Path to a document in the vault: specs/<feature>.md or plans/<feature>.md. */
export function documentPath(
  vaultPath: string,
  feature: string,
  type: DocumentType
): string {
  validateFeatureName(feature);
  return path.join(vaultPath, type === "spec" ? "specs" : "plans", `${feature}.md`);
}

/** Relative (in-repo) path to a document, for staging. */
export function documentRelPath(feature: string, type: DocumentType): string {
  validateFeatureName(feature);
  return path.posix.join(type === "spec" ? "specs" : "plans", `${feature}.md`);
}

/** Relative (in-repo) path to an approval record, for staging. */
export function approvalRelPath(feature: string, type: DocumentType): string {
  validateFeatureName(feature);
  return path.posix.join("approvals", `${feature}.${type}.json`);
}

/** Feature names present in the vault, from the manifest. */
export async function listFeatureNames(vaultPath: string): Promise<string[]> {
  return manifestFeatureNames(await readManifest(vaultPath));
}
