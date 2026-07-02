import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { VaultManager, appendAuditEntry } from "@signoff/vault-core";
import { readAuditLog } from "../src/main/vault-bridge.js";

let root: string, vaultPath: string;
const orig = process.env.SIGNOFF_HOME;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-readaudit-"));
  process.env.SIGNOFF_HOME = root;
  vaultPath = path.join(root, "proj", ".signoff");
  await fs.mkdir(path.join(root, "proj"), { recursive: true });
  await VaultManager.create(vaultPath, "proj", undefined);
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  if (orig === undefined) delete process.env.SIGNOFF_HOME; else process.env.SIGNOFF_HOME = orig;
});

describe("readAuditLog", () => {
  it("returns entries filtered by feature, newest-first", async () => {
    for (const [ts, feature] of [
      ["2026-07-03T10:00:00.000Z", "a"], ["2026-07-03T12:00:00.000Z", "b"], ["2026-07-03T11:00:00.000Z", "b"],
    ] as const) {
      await appendAuditEntry(vaultPath, {
        v: 1, session_id: "s", ts, actor: "x@y.com", feature, repo: "proj",
        source: "gate", tool: "Write", decision: "allow",
      });
    }
    const rows = await readAuditLog(vaultPath, "b");
    expect(rows.map((r) => r.ts)).toEqual([
      "2026-07-03T12:00:00.000Z", "2026-07-03T11:00:00.000Z",
    ]);
  });
});
