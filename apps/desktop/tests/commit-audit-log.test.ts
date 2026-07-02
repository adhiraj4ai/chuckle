import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { VaultManager, appendAuditEntry } from "@signoff/vault-core";
import { commitAuditLog } from "../src/main/vault-bridge.js";

let root: string, vaultPath: string;
const orig = process.env.SIGNOFF_HOME;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-sync-"));
  process.env.SIGNOFF_HOME = root;
  vaultPath = path.join(root, "proj", ".signoff");
  await fs.mkdir(path.join(root, "proj"), { recursive: true });
  await VaultManager.create(vaultPath, "proj", undefined);
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  if (orig === undefined) delete process.env.SIGNOFF_HOME; else process.env.SIGNOFF_HOME = orig;
});

async function auditFileIsTracked(): Promise<boolean> {
  const tracked = await simpleGit(vaultPath).raw(["ls-files", "audit/"]);
  return tracked.trim().length > 0;
}

describe("commitAuditLog", () => {
  it("commits audit files that are present but uncommitted", async () => {
    await appendAuditEntry(vaultPath, {
      v: 1, session_id: "s", ts: "2026-07-03T10:00:00.000Z", actor: "a@b.com",
      feature: "f", repo: "proj", source: "gate", tool: "Write", decision: "allow",
    });
    expect(await auditFileIsTracked()).toBe(false);
    await commitAuditLog(vaultPath);
    expect(await auditFileIsTracked()).toBe(true);
  });

  it("is a no-op when there are no audit changes (no new commit)", async () => {
    const before = (await simpleGit(vaultPath).log()).total;
    await commitAuditLog(vaultPath);
    const after = (await simpleGit(vaultPath).log()).total;
    expect(after).toBe(before);
  });
});
