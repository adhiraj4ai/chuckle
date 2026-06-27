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
      path.join(vaultPath, "specs", "user-auth.md")
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

    expect(result.document_path).toBe(
      path.join(vaultPath, "specs", "user-auth.md")
    );
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

  it("writes the active-feature pointer to the project root on publish", async () => {
    const projectRoot = path.join(tmpDir, "project");
    await fs.mkdir(projectRoot, { recursive: true });

    await handlePublish(
      vaultPath,
      { source_path: sourcePath, feature_name: "user-auth", document_type: "spec" },
      projectRoot
    );

    const pointer = JSON.parse(
      await fs.readFile(path.join(projectRoot, ".chuckle", "active-feature.json"), "utf-8")
    );
    expect(pointer.feature).toBe("user-auth");
    expect(pointer.vaultPath).toBe(vaultPath);
    expect(pointer.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it("records the inferred feature name in the pointer when not provided", async () => {
    const projectRoot = path.join(tmpDir, "project2");
    await fs.mkdir(projectRoot, { recursive: true });

    await handlePublish(
      vaultPath,
      { source_path: sourcePath, document_type: "spec" },
      projectRoot
    );

    const pointer = JSON.parse(
      await fs.readFile(path.join(projectRoot, ".chuckle", "active-feature.json"), "utf-8")
    );
    expect(pointer.feature).toBe("user-auth");
    expect(pointer.vaultPath).toBe(vaultPath);
    expect(pointer.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });
});
