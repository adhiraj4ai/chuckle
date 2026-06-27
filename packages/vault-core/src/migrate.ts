import fs from "node:fs/promises";
import path from "node:path";
import type { DocumentType } from "./types.js";
import { documentPath } from "./layout.js";
import { approvalFilePath } from "./approval.js";

const DOC_TYPES: DocumentType[] = ["spec", "plan"];

async function moveIfExists(from: string, to: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.rename(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/**
 * Migrate a legacy vault to the docs-as-vault layout:
 *   .chuckle/{config,workflows}.json  -> {config,workflows}.json (root)
 *   features/<f>/<t>.md               -> specs|plans/<f>.md
 *   features/<f>/<t>.approval.json    -> approvals/<f>.<t>.json
 * Idempotent: a no-op on already-migrated vaults.
 */
export async function migrateVault(vaultPath: string): Promise<void> {
  await moveIfExists(
    path.join(vaultPath, ".chuckle", "config.json"),
    path.join(vaultPath, "config.json")
  );
  await moveIfExists(
    path.join(vaultPath, ".chuckle", "workflows.json"),
    path.join(vaultPath, "workflows.json")
  );

  const featuresDir = path.join(vaultPath, "features");
  let features: string[];
  try {
    features = await fs.readdir(featuresDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }

  for (const feature of features) {
    for (const type of DOC_TYPES) {
      await moveIfExists(
        path.join(featuresDir, feature, `${type}.md`),
        documentPath(vaultPath, feature, type)
      );
      await moveIfExists(
        path.join(featuresDir, feature, `${type}.approval.json`),
        approvalFilePath(vaultPath, feature, type)
      );
    }
  }

  await fs.rm(featuresDir, { recursive: true, force: true });
}
