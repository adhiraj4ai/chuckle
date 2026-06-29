import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Atomically write `text` to `filePath`: write to a temp file in the SAME
 * directory, then rename onto the target. rename(2) is atomic within a
 * filesystem, so a reader never observes a half-written file, and a crash
 * leaves either the old content or the new content — never a truncated file.
 * The temp file is cleaned up on failure so no stray temp files are left.
 */
export async function writeFileAtomic(filePath: string, text: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${crypto.randomBytes(6).toString("hex")}.tmp`);
  try {
    await fs.writeFile(tmp, text, "utf-8");
    await fs.rename(tmp, filePath);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

/** Atomically write `data` as pretty-printed JSON (with trailing newline). */
export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await writeFileAtomic(filePath, JSON.stringify(data, null, 2) + "\n");
}

/**
 * Parse JSON, turning a SyntaxError into a clear, path-tagged Error. Use for
 * files whose corruption should fail loudly rather than surface a raw
 * SyntaxError far from the source.
 */
export function parseJsonOrThrow<T>(raw: string, filePath: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`corrupt JSON at ${filePath}: ${detail}`);
  }
}
