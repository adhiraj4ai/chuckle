import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { VaultManager, readAuditEntries, appendAuditEntry } from "@signoff/vault-core";
import { recordMcpCall } from "../src/tools/audit-record.js";

let root: string, vaultPath: string;
const orig = process.env.SIGNOFF_HOME;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-mcp-"));
  process.env.SIGNOFF_HOME = root;
  vaultPath = path.join(root, "proj", ".signoff");
  await fs.mkdir(path.join(root, "proj"), { recursive: true });
  await VaultManager.create(vaultPath, "proj", undefined);
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  if (orig === undefined) delete process.env.SIGNOFF_HOME; else process.env.SIGNOFF_HOME = orig;
});

describe("recordMcpCall", () => {
  it("records a state-changing call with source=mcp, decision=allow", async () => {
    await recordMcpCall(vaultPath, "srv-1", "publish_document", { feature_name: "user-auth" });
    const rows = await readAuditEntries(vaultPath);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "mcp", decision: "allow", tool: "publish_document",
      feature: "user-auth", session_id: "srv-1", repo: "proj",
    });
  });

  it("resolves actor from the project repo identity, not the vault repo", async () => {
    // The project root is a git repo with a LOCAL identity; the vault (.signoff)
    // is a separate repo with no local identity. The recorder must read the
    // project-local email so MCP rows match the gate recorder's actor.
    const projectRoot = path.join(root, "proj");
    const g = simpleGit(projectRoot);
    await g.init();
    await g.addConfig("user.email", "work@corp.example");
    await g.addConfig("user.name", "Work Dev");

    await recordMcpCall(vaultPath, "srv-1", "submit_for_review", { feature_name: "f" });
    const rows = await readAuditEntries(vaultPath);
    expect(rows).toHaveLength(1);
    expect(rows[0].actor).toBe("work@corp.example");
  });

  it("is fail-open: swallows a genuine append failure", async () => {
    // Force a real ENOTDIR: put a FILE where the vault's parent dir should be, so
    // appendAuditEntry's `mkdir -p <vault>/audit` genuinely throws (a merely-missing
    // dir would be created by mkdir recursive and NOT exercise the catch).
    const fileAsParent = path.join(root, "not-a-dir");
    await fs.writeFile(fileAsParent, "x");
    const badVault = path.join(fileAsParent, ".signoff");

    // Precondition: the underlying append genuinely rejects for this path.
    await expect(
      appendAuditEntry(badVault, {
        v: 1, session_id: "s", ts: "2026-07-03T10:00:00.000Z", actor: "a@b.com",
        feature: "f", repo: "proj", source: "mcp", tool: "publish_document", decision: "allow",
      }),
    ).rejects.toThrow();

    // recordMcpCall must swallow that throw — without its internal catch this would reject.
    await expect(
      recordMcpCall(badVault, "srv-1", "publish_document", { feature_name: "f" }),
    ).resolves.toBeUndefined();
    // And no audit file was written under the bad vault.
    expect(await readAuditEntries(badVault)).toEqual([]);
  });
});
