import path from "node:path";

/**
 * Reject feature names that could escape the vault directory when used to build
 * a path (`path.join(vaultPath, …, feature)`). A feature name is an opaque
 * slug — it must never contain path separators, `..`, NUL bytes, or be empty.
 * Throws a clear Error on rejection; returns the name unchanged otherwise.
 */
export function validateFeatureName(feature: string): string {
  if (typeof feature !== "string" || feature.length === 0) {
    throw new Error(`invalid feature name: must be a non-empty string`);
  }
  if (
    feature.includes("/") ||
    feature.includes("\\") ||
    feature.includes("\0") ||
    feature === "." ||
    feature === ".." ||
    feature.split(/[\\/]/).includes("..") ||
    /(^|[\\/])\.\.([\\/]|$)/.test(feature)
  ) {
    throw new Error(
      `invalid feature name "${feature}": must not contain path separators or ".."`
    );
  }
  return feature;
}

// Strips date prefix (YYYY-MM-DD-), trailing -design/-spec/-plan suffix, and .md extension
export function inferFeatureName(filename: string): string {
  const basename = path.basename(filename, ".md");
  // Remove leading date prefix: YYYY-MM-DD-
  const withoutDate = basename.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  // Remove trailing -design, -spec, -plan suffixes
  const withoutSuffix = withoutDate.replace(/-(design|spec|plan)$/, "");
  return withoutSuffix.toLowerCase();
}
