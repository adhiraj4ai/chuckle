import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { DocumentType } from "./types.js";
import type { Category, CategoryColor } from "./categories.js";
import type { Tier } from "./tiers.js";
import { normalizeTicket, type Ticket } from "./ticket.js";
import { CATEGORY_COLORS, slugify, normalizeTags } from "./categories.js";
import { writeJsonAtomic, parseJsonOrThrow } from "./fsutil.js";

export interface FeatureDocs {
  spec?: string;
  plan?: string;
  adr?: string;
  category?: string;   // Category.id; absent ⇒ Uncategorized
  tags?: string[];     // normalized free-form labels
  tier?: string;       // Tier level; absent ⇒ "standard"
  ticket?: Ticket;
}

export interface Manifest {
  version: 2;
  categories: Category[];
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
    if ((err as NodeJS.ErrnoException).code === "ENOENT")
      return { version: 2, categories: [], features: {} };
    throw err;
  }
  // A corrupt manifest must fail loudly, not silently degrade to an empty index.
  const parsed = parseJsonOrThrow<Partial<Manifest>>(raw, filePath);
  // Read-time, non-destructive v1 -> v2 migration: persist v2 on the next write.
  return {
    version: 2,
    categories: parsed.categories ?? [],
    features: parsed.features ?? {},
  };
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

export function listCategories(m: Manifest): Category[] {
  return [...m.categories];
}

export function upsertCategory(m: Manifest, cat: Category): Manifest {
  const idx = m.categories.findIndex((c) => c.id === cat.id);
  const categories =
    idx === -1
      ? [...m.categories, cat]
      : m.categories.map((c) => (c.id === cat.id ? cat : c));
  return { ...m, categories };
}

export function removeCategory(m: Manifest, id: string): Manifest {
  const categories = m.categories.filter((c) => c.id !== id);
  const features: Record<string, FeatureDocs> = {};
  for (const [name, docs] of Object.entries(m.features)) {
    if (docs.category === id) {
      const { category: _drop, ...rest } = docs;
      features[name] = rest;
    } else {
      features[name] = docs;
    }
  }
  return { ...m, categories, features };
}

export function setFeatureCategory(
  m: Manifest,
  feature: string,
  categoryId: string | null
): Manifest {
  const current = m.features[feature] ?? {};
  const next: FeatureDocs = { ...current };
  if (categoryId !== null) next.category = categoryId;
  else delete next.category;
  return { ...m, features: { ...m.features, [feature]: next } };
}

export function setFeatureTags(m: Manifest, feature: string, tags: string[]): Manifest {
  const current = m.features[feature] ?? {};
  const normalized = normalizeTags(tags);
  const next: FeatureDocs = { ...current };
  if (normalized.length) next.tags = normalized;
  else delete next.tags;
  return { ...m, features: { ...m.features, [feature]: next } };
}

export function ensureCategory(
  m: Manifest,
  name: string,
  color?: CategoryColor
): { manifest: Manifest; id: string } {
  const existing = m.categories.find(
    (c) => c.name.toLowerCase() === name.trim().toLowerCase()
  );
  if (existing) return { manifest: m, id: existing.id };

  // Unique id: slug, with -2/-3 suffixes on collision.
  const baseId = slugify(name);
  let id = baseId;
  let n = 2;
  while (m.categories.some((c) => c.id === id)) id = `${baseId}-${n++}`;

  // Color: caller-specified, else first unused, else round-robin by count.
  const used = new Set(m.categories.map((c) => c.color));
  const chosen =
    color ??
    CATEGORY_COLORS.find((c) => !used.has(c)) ??
    CATEGORY_COLORS[m.categories.length % CATEGORY_COLORS.length];

  const manifest = upsertCategory(m, { id, name: name.trim(), color: chosen });
  return { manifest, id };
}

export function setFeatureTier(m: Manifest, feature: string, tier: Tier | null): Manifest {
  const current = m.features[feature] ?? {};
  const next: FeatureDocs = { ...current };
  if (tier) next.tier = tier;
  else delete next.tier;
  return { ...m, features: { ...m.features, [feature]: next } };
}

export function setFeatureTicket(m: Manifest, feature: string, ticket: Ticket | null): Manifest {
  const current = m.features[feature] ?? {};
  const next: FeatureDocs = { ...current };
  const normalized = ticket ? normalizeTicket(ticket) : null;
  if (normalized) next.ticket = normalized;
  else delete next.ticket;
  return { ...m, features: { ...m.features, [feature]: next } };
}
