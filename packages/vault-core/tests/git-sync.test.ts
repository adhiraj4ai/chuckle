import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { simpleGit } from "simple-git";
import {
  initVaultRepo, stageAndCommit, addRemote, getRemoteUrl, hasRemote, getCurrentBranch,
  publishBranch, fetch as gitFetch, pullRebase, push, getSyncState, cloneVault,
  classifyGitError, SyncConflictError,
} from "../src/git.js";

let tmp: string, repo: string, bare: string;

async function makeCommit(dir: string, file: string, body: string, msg: string) {
  await fs.writeFile(path.join(dir, file), body);
  await stageAndCommit(dir, [file], msg, "dev@org.com", "Dev");
}

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "git-sync-"));
  repo = path.join(tmp, "repo");
  bare = path.join(tmp, "remote.git");
  await fs.mkdir(repo, { recursive: true });
  await initVaultRepo(repo);
  await makeCommit(repo, "a.txt", "1\n", "init");
  await simpleGit().init(["--bare", bare]);
});
afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

describe("classifyGitError", () => {
  it("classifies auth, conflict, network, other", () => {
    expect(classifyGitError("fatal: could not read Username for 'https://github.com'")).toBe("auth");
    expect(classifyGitError("git@github.com: Permission denied (publickey).")).toBe("auth");
    expect(classifyGitError("CONFLICT (content): Merge conflict in approvals/x.json")).toBe("conflict");
    expect(classifyGitError("fatal: Could not resolve host: github.com")).toBe("network");
    expect(classifyGitError("some other failure")).toBe("other");
  });
});

describe("remote primitives", () => {
  it("addRemote + getRemoteUrl + hasRemote", async () => {
    expect(await hasRemote(repo)).toBe(false);
    await addRemote(repo, bare);
    expect(await hasRemote(repo)).toBe(true);
    expect(await getRemoteUrl(repo)).toBe(bare);
    // idempotent: addRemote again updates the url
    await addRemote(repo, bare);
    expect(await getRemoteUrl(repo)).toBe(bare);
  });

  it("publishBranch sets upstream and getSyncState reflects it", async () => {
    await addRemote(repo, bare);
    let st = await getSyncState(repo);
    expect(st.hasRemote).toBe(true);
    expect(st.hasUpstream).toBe(false);
    await publishBranch(repo);
    st = await getSyncState(repo);
    expect(st.hasUpstream).toBe(true);
    expect(st.ahead).toBe(0);
    expect(st.behind).toBe(0);
  });
});

describe("clone + pullRebase", () => {
  it("clones a published vault and pulls a later change", async () => {
    await addRemote(repo, bare);
    await publishBranch(repo);
    const clone = path.join(tmp, "clone");
    await cloneVault(bare, clone);
    expect((await fs.readFile(path.join(clone, "a.txt"), "utf-8")).trim()).toBe("1");
    // repo makes another commit + push; clone pulls it
    await makeCommit(repo, "a.txt", "2\n", "update");
    await push(repo);
    await pullRebase(clone);
    expect((await fs.readFile(path.join(clone, "a.txt"), "utf-8")).trim()).toBe("2");
  });

  it("pullRebase throws SyncConflictError and leaves no rebase in progress on divergent overlap", async () => {
    await addRemote(repo, bare);
    await publishBranch(repo);
    const clone = path.join(tmp, "clone2");
    await cloneVault(bare, clone);
    // both edit the same line, diverging
    await makeCommit(repo, "a.txt", "from-repo\n", "repo edit");
    await push(repo);
    await makeCommit(clone, "a.txt", "from-clone\n", "clone edit"); // local unpushed, overlaps
    await expect(pullRebase(clone)).rejects.toBeInstanceOf(SyncConflictError);
    // rebase aborted: HEAD is the clone's own commit, working tree clean
    const status = await simpleGit(clone).status();
    expect(status.conflicted).toEqual([]);
  });
});
