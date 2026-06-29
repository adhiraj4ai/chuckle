import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  initVaultRepo,
  stageAndCommit,
  getHeadSha,
  validateRemoteUrl,
  isRebaseInProgress,
  addRemote,
  cloneVault,
} from "../src/git.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-git-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("initVaultRepo", () => {
  it("initializes a git repo with a .git directory", async () => {
    await initVaultRepo(tmpDir);
    const stat = await fs.stat(path.join(tmpDir, ".git"));
    expect(stat.isDirectory()).toBe(true);
  });

  it("is idempotent — calling twice does not throw", async () => {
    await initVaultRepo(tmpDir);
    await expect(initVaultRepo(tmpDir)).resolves.not.toThrow();
  });
});

describe("stageAndCommit", () => {
  it("creates a commit and returns a SHA", async () => {
    await initVaultRepo(tmpDir);
    const filePath = path.join(tmpDir, "test.txt");
    await fs.writeFile(filePath, "hello");

    const sha = await stageAndCommit(
      tmpDir,
      ["test.txt"],
      "test: initial commit",
      "dev@org.com",
      "Developer"
    );

    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("getHeadSha returns the same SHA as the commit", async () => {
    await initVaultRepo(tmpDir);
    await fs.writeFile(path.join(tmpDir, "file.txt"), "content");

    const sha = await stageAndCommit(
      tmpDir,
      ["file.txt"],
      "test: commit",
      "dev@org.com",
      "Developer"
    );

    const head = await getHeadSha(tmpDir);
    expect(head).toBe(sha);
  });
});

describe("validateRemoteUrl (option-injection defense)", () => {
  it.each([
    "https://github.com/me/repo.git",
    "http://example.com/r.git",
    "ssh://git@host/r.git",
    "git://host/r.git",
    "file:///srv/repo.git",
    "git@github.com:me/repo.git",
    "/abs/local/repo",
  ])("accepts %j", (url) => {
    expect(validateRemoteUrl(url)).toBe(url);
  });

  it("rejects a --upload-pack option-injection URL", () => {
    expect(() => validateRemoteUrl("--upload-pack=touch /tmp/pwned")).toThrow(/option injection/);
  });

  it.each(["-x", "--foo", "", "   ", "not a url", "relative/path"])(
    "rejects %j",
    (url) => {
      expect(() => validateRemoteUrl(url)).toThrow();
    }
  );

  it("addRemote rejects an option-injection URL", async () => {
    await initVaultRepo(tmpDir);
    await expect(addRemote(tmpDir, "--upload-pack=evil")).rejects.toThrow(/option injection/);
  });

  it("cloneVault rejects an option-injection URL", async () => {
    await expect(cloneVault("--upload-pack=evil", path.join(tmpDir, "dest"))).rejects.toThrow(
      /option injection/
    );
  });
});

describe("isRebaseInProgress", () => {
  it("is false for a fresh repo", async () => {
    await initVaultRepo(tmpDir);
    expect(await isRebaseInProgress(tmpDir)).toBe(false);
  });

  it("is true when a rebase-merge dir is present", async () => {
    await initVaultRepo(tmpDir);
    await fs.mkdir(path.join(tmpDir, ".git", "rebase-merge"), { recursive: true });
    expect(await isRebaseInProgress(tmpDir)).toBe(true);
  });

  it("is true when a rebase-apply dir is present", async () => {
    await initVaultRepo(tmpDir);
    await fs.mkdir(path.join(tmpDir, ".git", "rebase-apply"), { recursive: true });
    expect(await isRebaseInProgress(tmpDir)).toBe(true);
  });
});

describe("initVaultRepo inside a parent repo", () => {
  it("creates a nested repo even when the dir is inside another git repo", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const os = await import("node:os");
    const { simpleGit } = await import("simple-git");
    const { initVaultRepo } = await import("../src/git.js");

    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-parent-"));
    await simpleGit(parent).init();
    await fs.writeFile(path.join(parent, ".gitignore"), ".signoff/\n");
    const vaultDir = path.join(parent, ".signoff");
    await fs.mkdir(vaultDir, { recursive: true });

    await initVaultRepo(vaultDir);

    // the vault must be its OWN repo root, not the parent
    const stat = await fs.stat(path.join(vaultDir, ".git"));
    expect(stat.isDirectory()).toBe(true);

    await fs.rm(parent, { recursive: true, force: true });
  });
});
