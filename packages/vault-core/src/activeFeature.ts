import fs from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomic, parseJsonOrThrow } from "./fsutil.js";

export interface ActiveFeature {
  feature: string;
  vaultPath: string;
  publishedAt: string; // ISO 8601 UTC
}

function pointerPath(projectRoot: string): string {
  return path.join(projectRoot, ".signoff", "active-feature.json");
}

export async function writeActiveFeature(
  projectRoot: string,
  data: { feature: string; vaultPath: string }
): Promise<ActiveFeature> {
  const record: ActiveFeature = {
    feature: data.feature,
    vaultPath: data.vaultPath,
    publishedAt: new Date().toISOString(),
  };
  await writeJsonAtomic(pointerPath(projectRoot), record);
  return record;
}

export async function readActiveFeature(
  projectRoot: string
): Promise<ActiveFeature | null> {
  let raw: string;
  try {
    raw = await fs.readFile(pointerPath(projectRoot), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const parsed = parseJsonOrThrow<Partial<ActiveFeature>>(raw, pointerPath(projectRoot));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("active-feature.json is not an object");
  }
  if (
    typeof parsed.feature !== "string" ||
    typeof parsed.vaultPath !== "string" ||
    typeof parsed.publishedAt !== "string"
  ) {
    throw new Error(
      "active-feature.json missing required fields: feature, vaultPath, publishedAt"
    );
  }
  return {
    feature: parsed.feature,
    vaultPath: parsed.vaultPath,
    publishedAt: parsed.publishedAt,
  };
}
