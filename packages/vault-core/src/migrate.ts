import fs from "node:fs/promises";
import path from "node:path";
import type { DocumentType } from "./types.js";
import { documentPath } from "./layout.js";
import { approvalFilePath } from "./approval.js";
import {
  readManifest,
  writeManifest,
  setFeatureDoc,
  getFeatureDoc,
  manifestRelPath,
  projectRootOf,
  type Manifest,
} from "./manifest.js";
import { inferFeatureName } from "./feature.js";
import { stageAndCommit } from "./git.js";
import { simpleGit } from "simple-git";

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

function classifyDoc(relPath: string): DocumentType {
  const p = relPath.toLowerCase();
  if (/(^|\/)plans?(\/|$)/.test(p) || /plan/.test(path.basename(p))) return "plan";
  return "spec";
}

async function walkMarkdown(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if ([".signoff", ".chuckle", ".git", "node_modules"].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkMarkdown(full)));
    else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) out.push(full);
  }
  return out;
}

async function dirHasMarkdown(dir: string): Promise<boolean> {
  try {
    return (await fs.readdir(dir)).some((f) => f.endsWith(".md"));
  } catch {
    return false;
  }
}

export async function migrateToIndex(
  vaultPath: string
): Promise<{ migrated: boolean; unresolved: string[] }> {
  const indexExists = await fs
    .access(path.join(vaultPath, manifestRelPath))
    .then(() => true)
    .catch(() => false);

  if (indexExists) {
    // A vault is already migrated when index.json exists and every copy in
    // specs/ or plans/ is already referenced by the manifest as a .signoff/…
    // fallback.  Copies that ARE the manifest's fallback must not trigger
    // re-migration (they are intentional orphan fallbacks, not unmigrated docs).
    const existingManifest = await readManifest(vaultPath);
    let hasUnmigrated = false;
    for (const type of DOC_TYPES) {
      const dir = path.join(vaultPath, type === "spec" ? "specs" : "plans");
      let files: string[] = [];
      try { files = await fs.readdir(dir); } catch { /* dir absent — nothing to check */ }
      for (const f of files) {
        if (!f.endsWith(".md")) continue;
        const feature = f.slice(0, -3);
        const fallbackRel = `.signoff/${type === "spec" ? "specs" : "plans"}/${feature}.md`;
        if (getFeatureDoc(existingManifest, feature, type) !== fallbackRel) {
          hasUnmigrated = true;
          break;
        }
      }
      if (hasUnmigrated) break;
    }
    if (!hasUnmigrated) return { migrated: false, unresolved: [] };
  }

  const projectRoot = projectRootOf(vaultPath);
  let docRoots = ["docs", ".superpowers"];
  try {
    const cfg = JSON.parse(await fs.readFile(path.join(vaultPath, "config.json"), "utf-8"));
    if (Array.isArray(cfg.doc_roots) && cfg.doc_roots.length) docRoots = cfg.doc_roots;
  } catch {
    /* default */
  }

  let manifest: Manifest = await readManifest(vaultPath);

  // 1. Map project docs into the manifest.
  // Collect all candidates, sort them so the collision rule is deterministic
  // (first by sorted path wins; later files for the same feature/type are ignored).
  const allFiles: string[] = [];
  for (const root of docRoots) {
    allFiles.push(...(await walkMarkdown(path.join(projectRoot, root))));
  }
  allFiles.sort();
  for (const file of allFiles) {
    const feature = inferFeatureName(path.basename(file));
    if (!feature) continue;
    const rel = path.relative(projectRoot, file).split(path.sep).join("/");
    const type = classifyDoc(rel);
    // Skip if this feature/type is already set (first-by-sorted-path wins).
    if (getFeatureDoc(manifest, feature, type) !== null) continue;
    manifest = setFeatureDoc(manifest, feature, type, rel);
  }

  // 2. For approvals with no project doc, keep the vault copy as a fallback.
  const unresolved: string[] = [];
  let approvals: string[] = [];
  try {
    approvals = await fs.readdir(path.join(vaultPath, "approvals"));
  } catch {
    /* none */
  }
  for (const file of approvals) {
    const m = file.match(/^(.+)\.(spec|plan)\.json$/);
    if (!m) continue;
    const [, feature, type] = m as [string, string, DocumentType];
    if (getFeatureDoc(manifest, feature, type)) continue;
    const copyRel = `.signoff/${type === "spec" ? "specs" : "plans"}/${feature}.md`;
    const copyAbs = path.join(projectRoot, copyRel);
    if (await fs.access(copyAbs).then(() => true).catch(() => false)) {
      manifest = setFeatureDoc(manifest, feature, type, copyRel);
    }
    unresolved.push(`${feature}/${type}`);
  }

  // 3. Remove vault copies that were matched to project docs (not the fallbacks).
  for (const type of DOC_TYPES) {
    const dir = path.join(vaultPath, type === "spec" ? "specs" : "plans");
    let files: string[] = [];
    try {
      files = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".md")) continue;
      const feature = f.slice(0, -3);
      const rel = getFeatureDoc(manifest, feature, type);
      if (rel && !rel.startsWith(".signoff/")) {
        await fs.rm(path.join(dir, f), { force: true });
      }
    }
    // drop the dir if now empty
    try {
      if ((await fs.readdir(dir)).length === 0) await fs.rmdir(dir);
    } catch {
      /* ignore */
    }
  }

  await writeManifest(vaultPath, manifest);

  // 4. Commit the migration (stage everything, since copies were deleted).
  try {
    const git = simpleGit(vaultPath);
    const [name, email] = await Promise.all([
      git.getConfig("user.name").then((r) => r.value ?? "Signoff"),
      git.getConfig("user.email").then((r) => r.value ?? "signoff@local"),
    ]);
    await stageAndCommit(vaultPath, ["-A"], "chore: migrate vault to index-by-path", email, name);
  } catch {
    /* best-effort; manifest is written regardless */
  }

  return { migrated: true, unresolved };
}
