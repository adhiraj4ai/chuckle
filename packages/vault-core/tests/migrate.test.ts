import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { migrateVault } from "../src/migrate.js";
import { readApproval } from "../src/approval.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "chuckle-migrate-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("migrateVault", () => {
  it("converts a legacy features/ vault to the docs-as-vault layout", async () => {
    // build a legacy vault
    await fs.mkdir(path.join(tmpDir, ".chuckle"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, ".chuckle", "config.json"), '{"name":"x","org":"y","created_at":"t"}');
    await fs.writeFile(path.join(tmpDir, ".chuckle", "workflows.json"), "{}");
    await fs.mkdir(path.join(tmpDir, "features", "user-auth"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "features", "user-auth", "spec.md"), "# Spec");
    await fs.writeFile(
      path.join(tmpDir, "features", "user-auth", "spec.approval.json"),
      JSON.stringify({ document: "spec.md", feature: "user-auth", type: "spec", workflow: "spec", status: "approved", history: [] })
    );

    await migrateVault(tmpDir);

    // config moved to root
    expect((await fs.stat(path.join(tmpDir, "config.json"))).isFile()).toBe(true);
    // doc moved to specs/
    expect(await fs.readFile(path.join(tmpDir, "specs", "user-auth.md"), "utf-8")).toBe("# Spec");
    // approval readable via the new path
    const record = await readApproval(tmpDir, "user-auth", "spec");
    expect(record?.status).toBe("approved");
    // old features/ removed
    await expect(fs.stat(path.join(tmpDir, "features"))).rejects.toThrow();
  });

  it("is a no-op on an already-migrated vault", async () => {
    await fs.writeFile(path.join(tmpDir, "config.json"), "{}");
    await expect(migrateVault(tmpDir)).resolves.toBeUndefined();
  });
});
