import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { VaultManager } from "../src/vault.js";
import { readManifest, getFeatureDoc, hashContent } from "../src/manifest.js";
import { readApproval } from "../src/approval.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmp: string;
let vaultPath: string;
let registryDir: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-vault-"));
  vaultPath = path.join(tmp, "project", ".signoff");
  await fs.mkdir(vaultPath, { recursive: true });
  registryDir = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-registry-"));
  process.env.SIGNOFF_HOME = registryDir;
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.rm(registryDir, { recursive: true, force: true });
  delete process.env.SIGNOFF_HOME;
});

describe("VaultManager.create", () => {
  it("create scaffolds an empty manifest and no specs/plans dirs", async () => {
    await VaultManager.create(vaultPath, "proj");
    const m = await readManifest(vaultPath);
    expect(m).toEqual({ version: 2, categories: [], features: {} });
    await expect(fs.stat(path.join(vaultPath, "specs"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(path.join(vaultPath, "plans"))).rejects.toMatchObject({ code: "ENOENT" });
    const config = JSON.parse(await fs.readFile(path.join(vaultPath, "config.json"), "utf-8"));
    expect(config.doc_roots).toEqual(["docs"]);
  });

  it("writes config.json with name and org", async () => {
    await VaultManager.create(vaultPath, "test-project", "acme");
    const raw = await fs.readFile(path.join(vaultPath, "config.json"), "utf-8");
    const config = JSON.parse(raw);
    expect(config.name).toBe("test-project");
    expect(config.org).toBe("acme");
    expect(config.doc_roots).toEqual(["docs"]);
  });

  it("writes default workflows.json", async () => {
    await VaultManager.create(vaultPath, "test-project", "acme");
    const raw = await fs.readFile(path.join(vaultPath, "workflows.json"), "utf-8");
    const wf = JSON.parse(raw);
    expect(wf.spec.min_approvals).toBe(1);
    expect(wf.plan.min_approvals).toBe(1);
  });

  it("scaffolds approvals/ directory", async () => {
    await VaultManager.create(vaultPath, "proj");
    const stat = await fs.stat(path.join(vaultPath, "approvals"));
    expect(stat.isDirectory()).toBe(true);
  });
});

describe("VaultManager.open", () => {
  it("opens existing vault", async () => {
    await VaultManager.create(vaultPath, "test-project", "acme");
    const vm = await VaultManager.open(vaultPath);
    expect(vm.config.name).toBe("test-project");
    expect(vm.vaultPath).toBe(vaultPath);
  });

  it("throws if not a vault", async () => {
    await expect(VaultManager.open(vaultPath)).rejects.toThrow("not a SignOff vault");
  });
});

describe("VaultManager.submitForReview", () => {
  it("registers the doc path and records its hash without copying", async () => {
    const projectRoot = path.dirname(vaultPath);
    await fs.mkdir(path.join(projectRoot, "docs"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "docs", "a.md"), "# Spec\n");
    await VaultManager.create(vaultPath, "proj");
    const vault = await VaultManager.open(vaultPath);

    await vault.submitForReview("user-auth", "spec", "docs/a.md", "dev@org.com", "Dev");

    const m = await readManifest(vaultPath);
    expect(getFeatureDoc(m, "user-auth", "spec")).toBe("docs/a.md");
    // no copy created in the vault
    await expect(fs.stat(path.join(vaultPath, "specs", "user-auth.md"))).rejects.toMatchObject({ code: "ENOENT" });
    const rec = await readApproval(vaultPath, "user-auth", "spec");
    expect(rec?.status).toBe("pending");
    expect(rec?.history.at(-1)?.content_hash).toBe(hashContent("# Spec\n"));
    expect(rec?.document).toBe("docs/a.md");
  });

  it("returns a valid commit sha", async () => {
    const projectRoot = path.dirname(vaultPath);
    await fs.mkdir(path.join(projectRoot, "docs"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "docs", "spec.md"), "# Spec\n");
    await VaultManager.create(vaultPath, "proj");
    const vault = await VaultManager.open(vaultPath);

    const result = await vault.submitForReview("user-auth", "spec", "docs/spec.md", "dev@org.com", "Dev");
    expect(result.commit_sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("second submitForReview produces resubmitted action and 2 history entries", async () => {
    const projectRoot = path.dirname(vaultPath);
    await fs.mkdir(path.join(projectRoot, "docs"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "docs", "spec.md"), "# Spec v1");
    await VaultManager.create(vaultPath, "proj");
    const vault = await VaultManager.open(vaultPath);

    await vault.submitForReview("user-auth", "spec", "docs/spec.md", "dev@org.com", "Dev");
    await fs.writeFile(path.join(projectRoot, "docs", "spec.md"), "# Spec v2");
    await vault.submitForReview("user-auth", "spec", "docs/spec.md", "dev@org.com", "Dev");

    const rec = await readApproval(vaultPath, "user-auth", "spec");
    expect(rec?.history).toHaveLength(2);
    expect(rec?.history[1].action).toBe("resubmitted");
    expect(rec?.history[1].content_hash).toBe(hashContent("# Spec v2"));
  });
});

describe("VaultManager.publish (thin alias for submitForReview)", () => {
  it("registers the doc in the manifest and creates an approval record", async () => {
    const projectRoot = path.dirname(vaultPath);
    await fs.mkdir(path.join(projectRoot, "docs"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "docs", "user-auth-design.md"), "# User Auth Spec\n");
    await VaultManager.create(vaultPath, "test-project", "acme");
    const vm = await VaultManager.open(vaultPath);

    const result = await vm.publish("docs/user-auth-design.md", "user-auth", "spec", "dev@org.com", "Developer");

    expect(result.commit_sha).toMatch(/^[0-9a-f]{40}$/);
    const m = await readManifest(vaultPath);
    expect(getFeatureDoc(m, "user-auth", "spec")).toBe("docs/user-auth-design.md");
    const rec = await readApproval(vaultPath, "user-auth", "spec");
    expect(rec?.status).toBe("pending");
    expect(rec?.history[0].action).toBe("submitted");
  });
});

describe("VaultManager registry", () => {
  it("registers and lists vaults", async () => {
    await VaultManager.registerVault({
      name: "test-project",
      path: vaultPath,
      last_opened: new Date().toISOString(),
    });

    const vaults = await VaultManager.listVaults();
    expect(vaults.some((v) => v.path === vaultPath)).toBe(true);
  });
});
