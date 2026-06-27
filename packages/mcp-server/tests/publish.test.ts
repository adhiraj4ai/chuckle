import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { VaultManager } from "@chuckle/vault-core";
import { handlePublish } from "../src/tools/publish.js";

let tmpDir: string;
let vaultPath: string;
let sourcePath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "chuckle-mcp-test-"));
  vaultPath = path.join(tmpDir, "vault");
  process.env.CHUCKLE_HOME = path.join(tmpDir, ".chuckle");
  await VaultManager.create(vaultPath, "test-project", "test-org");
  sourcePath = path.join(tmpDir, "2026-06-27-user-auth-design.md");
  await fs.writeFile(sourcePath, "# User Auth Spec\n\nThis is the spec.\n");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env.CHUCKLE_HOME;
});

describe("handlePublish", () => {
  it("publishes a spec document and returns vault_path, document_path, commit_sha", async () => {
    const result = await handlePublish(vaultPath, {
      source_path: sourcePath,
      feature_name: "user-auth",
      document_type: "spec",
    });

    expect(result.vault_path).toBe(vaultPath);
    expect(result.document_path).toBe(
      path.join(vaultPath, "features", "user-auth", "spec.md")
    );
    expect(result.commit_sha).toMatch(/^[0-9a-f]{40}$/);

    const content = await fs.readFile(result.document_path, "utf-8");
    expect(content).toBe("# User Auth Spec\n\nThis is the spec.\n");
  });

  it("infers feature_name from source_path filename when not provided", async () => {
    const result = await handlePublish(vaultPath, {
      source_path: sourcePath,
      document_type: "spec",
    });

    expect(result.document_path).toContain("user-auth");
  });

  it("throws if source_path does not exist", async () => {
    await expect(
      handlePublish(vaultPath, {
        source_path: path.join(tmpDir, "nonexistent.md"),
        feature_name: "user-auth",
        document_type: "spec",
      })
    ).rejects.toThrow();
  });

  it("throws if document_type is invalid", async () => {
    await expect(
      handlePublish(vaultPath, {
        source_path: sourcePath,
        feature_name: "user-auth",
        document_type: "invalid",
      })
    ).rejects.toThrow(/document_type/);
  });
});
