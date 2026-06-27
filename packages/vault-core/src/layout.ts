import fs from "node:fs/promises";
import path from "node:path";
import type { DocumentType } from "./types.js";

/** Path to a document in the vault: specs/<feature>.md or plans/<feature>.md. */
export function documentPath(
  vaultPath: string,
  feature: string,
  type: DocumentType
): string {
  return path.join(vaultPath, type === "spec" ? "specs" : "plans", `${feature}.md`);
}

/** Relative (in-repo) path to a document, for staging. */
export function documentRelPath(feature: string, type: DocumentType): string {
  return path.posix.join(type === "spec" ? "specs" : "plans", `${feature}.md`);
}

/** Relative (in-repo) path to an approval record, for staging. */
export function approvalRelPath(feature: string, type: DocumentType): string {
  return path.posix.join("approvals", `${feature}.${type}.json`);
}

/** Feature names present in the vault, derived from specs/ and plans/ filenames. */
export async function listFeatureNames(vaultPath: string): Promise<string[]> {
  const names = new Set<string>();
  for (const dir of ["specs", "plans"]) {
    try {
      const files = await fs.readdir(path.join(vaultPath, dir));
      for (const f of files) {
        if (f.endsWith(".md")) names.add(f.slice(0, -3));
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
  return [...names].sort();
}
