import fs from "node:fs/promises";
import path from "node:path";

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
  const filePath = pointerPath(projectRoot);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(record, null, 2) + "\n");
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
  const parsed = JSON.parse(raw) as Partial<ActiveFeature>;
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
