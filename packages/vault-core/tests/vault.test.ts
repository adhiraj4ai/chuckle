import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { VaultManager } from "../src/vault.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir: string;
let registryDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "chuckle-vault-"));
  registryDir = await fs.mkdtemp(path.join(os.tmpdir(), "chuckle-registry-"));
  process.env.CHUCKLE_HOME = registryDir;
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.rm(registryDir, { recursive: true, force: true });
  delete process.env.CHUCKLE_HOME;
});

describe("VaultManager.create", () => {
  it("initializes vault structure", async () => {
    await VaultManager.create(tmpDir, "test-project", "acme");
    for (const dir of ["specs", "plans", "approvals"]) {
      const stat = await fs.stat(path.join(tmpDir, dir));
      expect(stat.isDirectory()).toBe(true);
    }
  });

  it("writes config.json", async () => {
    await VaultManager.create(tmpDir, "test-project", "acme");
    const raw = await fs.readFile(path.join(tmpDir, "config.json"), "utf-8");
    const config = JSON.parse(raw);
    expect(config.name).toBe("test-project");
    expect(config.org).toBe("acme");
  });

  it("writes default workflows.json", async () => {
    await VaultManager.create(tmpDir, "test-project", "acme");
    const raw = await fs.readFile(path.join(tmpDir, "workflows.json"), "utf-8");
    const wf = JSON.parse(raw);
    expect(wf.spec.min_approvals).toBe(1);
    expect(wf.plan.min_approvals).toBe(1);
  });
});

describe("VaultManager.open", () => {
  it("opens existing vault", async () => {
    await VaultManager.create(tmpDir, "test-project", "acme");
    const vm = await VaultManager.open(tmpDir);
    expect(vm.config.name).toBe("test-project");
    expect(vm.vaultPath).toBe(tmpDir);
  });

  it("throws if not a vault", async () => {
    await expect(VaultManager.open(tmpDir)).rejects.toThrow("not a Chuckle vault");
  });
});

describe("VaultManager.publish", () => {
  it("copies doc into the vault specs folder and commits", async () => {
    const vm = await VaultManager.create(tmpDir, "test-project", "acme");
    const srcDir = await fs.mkdtemp(path.join(os.tmpdir(), "chuckle-src-"));
    const srcFile = path.join(srcDir, "2026-06-27-user-auth-design.md");
    await fs.writeFile(srcFile, "# User Auth Spec\n\nContent here.");

    const result = await vm.publish(srcFile, "user-auth", "spec", "dev@org.com", "Developer");

    const destStat = await fs.stat(path.join(tmpDir, "specs", "user-auth.md"));
    expect(destStat.isFile()).toBe(true);
    expect(result.commit_sha).toMatch(/^[0-9a-f]{40}$/);

    await fs.rm(srcDir, { recursive: true, force: true });
  });

  it("creates approval record with submitted status", async () => {
    const vm = await VaultManager.create(tmpDir, "test-project", "acme");
    const srcDir = await fs.mkdtemp(path.join(os.tmpdir(), "chuckle-src2-"));
    const srcFile = path.join(srcDir, "2026-06-27-user-auth-design.md");
    await fs.writeFile(srcFile, "# Spec");

    await vm.publish(srcFile, "user-auth", "spec", "dev@org.com", "Developer");

    const { readApproval } = await import("../src/approval.js");
    const record = await readApproval(tmpDir, "user-auth", "spec");
    expect(record?.status).toBe("pending");
    expect(record?.history[0].action).toBe("submitted");

    await fs.rm(srcDir, { recursive: true, force: true });
  });

  it("second publish produces resubmitted action and 2 history entries", async () => {
    const vm = await VaultManager.create(tmpDir, "test-project", "acme");
    const srcDir = await fs.mkdtemp(path.join(os.tmpdir(), "chuckle-src3-"));
    const srcFile = path.join(srcDir, "spec.md");
    await fs.writeFile(srcFile, "# Spec v1");

    await vm.publish(srcFile, "user-auth", "spec", "dev@org.com", "Developer");
    await fs.writeFile(srcFile, "# Spec v2");
    const result2 = await vm.publish(srcFile, "user-auth", "spec", "dev@org.com", "Developer");

    const { readApproval } = await import("../src/approval.js");
    const record = await readApproval(tmpDir, "user-auth", "spec");
    expect(record?.history).toHaveLength(2);
    expect(record?.history[1].action).toBe("resubmitted");
    expect(result2.commit_sha).toMatch(/^[0-9a-f]{40}$/);

    await fs.rm(srcDir, { recursive: true, force: true });
  });
});

describe("VaultManager registry", () => {
  it("registers and lists vaults", async () => {
    await VaultManager.registerVault({
      name: "test-project",
      path: tmpDir,
      last_opened: new Date().toISOString(),
    });

    const vaults = await VaultManager.listVaults();
    expect(vaults.some((v) => v.path === tmpDir)).toBe(true);
  });
});

describe("VaultManager.submitForReview", () => {
  it("records a submission for an in-place doc without copying", async () => {
    const fs2 = await import("node:fs/promises");
    const vm = await VaultManager.create(tmpDir, "p", "o");
    // the doc is written directly into the vault (docs-as-vault: no publish/copy)
    await fs2.writeFile(path.join(tmpDir, "specs", "user-auth.md"), "# Spec\n");

    const result = await vm.submitForReview("user-auth", "spec", "dev@org.com", "Dev");
    expect(result.commit_sha).toMatch(/^[0-9a-f]{40}$/);

    const { readApproval } = await import("../src/approval.js");
    const record = await readApproval(tmpDir, "user-auth", "spec");
    expect(record?.status).toBe("pending");
    expect(record?.history.at(-1)?.action).toBe("submitted");
  });
})
