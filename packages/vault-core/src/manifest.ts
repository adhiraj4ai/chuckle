import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { DocumentType } from "./types.js";
import { writeJsonAtomic, parseJsonOrThrow } from "./fsutil.js";

export interface FeatureDocs {
  spec?: string;
  plan?: string;
}

export interface Manifest {
  version: 1;
  features: Record<string, FeatureDocs>;
}

export const manifestRelPath = "index.json";

/** The project root that a vault's relative doc paths resolve against. */
export function projectRootOf(vaultPath: string): string {
  return path.dirname(vaultPath);
}

export async function readManifest(vaultPath: string): Promise<Manifest> {
  const filePath = path.join(vaultPath, manifestRelPath);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, features: {} };
    throw err;
  }
  // A corrupt manifest must fail loudly, not silently degrade to an empty
  // index (which would lose every feature/approval mapping).
  const parsed = parseJsonOrThrow<Manifest>(raw, filePath);
  return { version: 1, features: parsed.features ?? {} };
}

export async function writeManifest(vaultPath: string, manifest: Manifest): Promise<void> {
  await writeJsonAtomic(path.join(vaultPath, manifestRelPath), manifest);
}

export function getFeatureDoc(m: Manifest, feature: string, type: DocumentType): string | null {
  return m.features[feature]?.[type] ?? null;
}

export function setFeatureDoc(
  m: Manifest,
  feature: string,
  type: DocumentType,
  relPath: string
): Manifest {
  const current = m.features[feature] ?? {};
  return {
    ...m,
    features: { ...m.features, [feature]: { ...current, [type]: relPath } },
  };
}

export function removeFeatureDoc(m: Manifest, feature: string, type: DocumentType): Manifest {
  const current = m.features[feature];
  if (!current) return m;
  const next: FeatureDocs = { ...current };
  delete next[type];
  const features = { ...m.features };
  if (next.spec || next.plan) features[feature] = next;
  else delete features[feature];
  return { ...m, features };
}

export function manifestFeatureNames(m: Manifest): string[] {
  return Object.keys(m.features).sort();
}

export function resolveDocPath(
  vaultPath: string,
  m: Manifest,
  feature: string,
  type: DocumentType
): string | null {
  const rel = getFeatureDoc(m, feature, type);
  return rel ? path.join(projectRootOf(vaultPath), rel) : null;
}

export function hashContent(buf: Buffer | string): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}
