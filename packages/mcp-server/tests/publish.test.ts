import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { VaultManager } from "@signoff/vault-core";
import { handlePublish } from "../src/tools/publish.js";

let tmpDir: string;
let vaultPath: string;
let projectRoot: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-mcp-test-"));
  // vaultPath is <tmp>/project/.signoff so project root is <tmp>/project/
  vaultPath = path.join(tmpDir, "project", ".signoff");
  projectRoot = path.dirname(vaultPath);
  process.env.SIGNOFF_HOME = path.join(tmpDir, ".signoff");
  await VaultManager.create(vaultPath, "test-project", "test-org");
  // Create the source doc in the project root
  await fs.mkdir(path.join(projectRoot, "docs"), { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, "docs", "2026-06-27-user-auth-design.md"),
    "# User Auth Spec\n\nThis is the spec.\n"
  );
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env.SIGNOFF_HOME;
});

describe("handlePublish", () => {
  it("publishes a spec document and returns vault_path, document_path, commit_sha", async () => {
    const result = await handlePublish(vaultPath, {
      feature_name: "user-auth",
      document_type: "spec",
      document_path: "docs/2026-06-27-user-auth-design.md",
    });

    expect(result.vault_path).toBe(vaultPath);
    expect(result.document_path).toContain("docs/2026-06-27-user-auth-design.md");
    expect(result.commit_sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("throws if feature_name is missing", async () => {
    await expect(
      handlePublish(vaultPath, {
        document_type: "spec",
        document_path: "docs/2026-06-27-user-auth-design.md",
      })
    ).rejects.toThrow(/feature_name/);
  });

  it("throws if document_path is missing", async () => {
    await expect(
      handlePublish(vaultPath, {
        feature_name: "user-auth",
        document_type: "spec",
      })
    ).rejects.toThrow(/document_path/);
  });

  it("throws if document_type is invalid", async () => {
    await expect(
      handlePublish(vaultPath, {
        feature_name: "user-auth",
        document_type: "invalid",
        document_path: "docs/2026-06-27-user-auth-design.md",
      })
    ).rejects.toThrow(/document_type/);
  });

  it("writes the active-feature pointer to the project root on publish", async () => {
    await handlePublish(
      vaultPath,
      {
        feature_name: "user-auth",
        document_type: "spec",
        document_path: "docs/2026-06-27-user-auth-design.md",
      },
      projectRoot
    );

    const pointer = JSON.parse(
      await fs.readFile(path.join(projectRoot, ".signoff", "active-feature.json"), "utf-8")
    );
    expect(pointer.feature).toBe("user-auth");
    expect(pointer.vaultPath).toBe(vaultPath);
    expect(pointer.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });
});
