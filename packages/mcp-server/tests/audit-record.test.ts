import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { VaultManager, readAuditEntries } from "@signoff/vault-core";
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

  it("is fail-open on a bad vault path", async () => {
    await expect(
      recordMcpCall(path.join(root, "nope", ".signoff"), "srv-1", "publish_document", {}),
    ).resolves.toBeUndefined();
  });
});
