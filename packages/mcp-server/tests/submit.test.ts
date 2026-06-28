import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { VaultManager, readApproval } from "@signoff/vault-core";
import { handleSubmit } from "../src/tools/submit.js";

let tmpDir: string;
let vaultPath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-mcp-submit-"));
  // vaultPath is <tmp>/project/.signoff so project root is <tmp>/project/
  vaultPath = path.join(tmpDir, "project", ".signoff");
  process.env.SIGNOFF_HOME = path.join(tmpDir, ".signoff");
  await VaultManager.create(vaultPath, "p");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env.SIGNOFF_HOME;
});

describe("handleSubmit", () => {
  it("registers the doc path and records a pending approval", async () => {
    const projectRoot = path.dirname(vaultPath);
    await fs.mkdir(path.join(projectRoot, "docs"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "docs", "auth.md"), "# Auth\n");
    const result = await handleSubmit(vaultPath, {
      feature_name: "user-auth",
      document_type: "spec",
      document_path: "docs/auth.md",
    });
    expect(result.document_path).toContain("docs/auth.md");
    const rec = await readApproval(vaultPath, "user-auth", "spec");
    expect(rec?.status).toBe("pending");
  });

  it("throws if feature_name is missing", async () => {
    await expect(
      handleSubmit(vaultPath, { document_type: "spec", document_path: "docs/auth.md" })
    ).rejects.toThrow(/feature_name/);
  });

  it("throws if document_type is invalid", async () => {
    await expect(
      handleSubmit(vaultPath, {
        feature_name: "user-auth",
        document_type: "brief",
        document_path: "docs/auth.md",
      })
    ).rejects.toThrow(/document_type/);
  });

  it("throws if document_path is missing", async () => {
    await expect(
      handleSubmit(vaultPath, { feature_name: "user-auth", document_type: "spec" })
    ).rejects.toThrow(/document_path/);
  });

  it("throws if document_path is empty", async () => {
    await expect(
      handleSubmit(vaultPath, {
        feature_name: "user-auth",
        document_type: "spec",
        document_path: "",
      })
    ).rejects.toThrow(/document_path/);
  });
});
