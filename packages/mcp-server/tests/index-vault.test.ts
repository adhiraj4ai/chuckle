import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { validateVaultPath } from "../src/index.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-mcp-vault-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("validateVaultPath", () => {
  it("rejects a non-existent path", () => {
    const missing = path.join(tmpDir, "does-not-exist");
    expect(() => validateVaultPath(missing)).toThrow(/does not exist/);
  });

  it("rejects a path that is not a directory", async () => {
    const filePath = path.join(tmpDir, "a-file");
    await fs.writeFile(filePath, "not a vault");
    expect(() => validateVaultPath(filePath)).toThrow(/not a directory/);
  });

  it("rejects an existing directory with no config.json", async () => {
    const dir = path.join(tmpDir, "empty-dir");
    await fs.mkdir(dir);
    expect(() => validateVaultPath(dir)).toThrow(/no config\.json/);
  });

  it("accepts a directory containing config.json", async () => {
    const dir = path.join(tmpDir, "valid-vault");
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, "config.json"), JSON.stringify({ name: "test" }));
    expect(() => validateVaultPath(dir)).not.toThrow();
  });
});
