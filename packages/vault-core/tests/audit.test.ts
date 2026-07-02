import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  appendAuditEntry, readAuditEntries, auditRelPaths, actorSlug, auditRelPathFor,
  type AuditEntry,
} from "../src/index.js";

let dir: string;
const orig = process.env.SIGNOFF_HOME;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-audit-"));
  process.env.SIGNOFF_HOME = dir;
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  if (orig === undefined) delete process.env.SIGNOFF_HOME; else process.env.SIGNOFF_HOME = orig;
});

function entry(over: Partial<AuditEntry> = {}): AuditEntry {
  return {
    v: 1, session_id: "s1", ts: "2026-07-03T10:00:00.000Z", actor: "a@b.com",
    feature: "user-auth", repo: "proj", source: "gate", tool: "Write", decision: "allow", ...over,
  };
}

describe("actorSlug", () => {
  it("sanitizes an email to a filesystem-safe token", () => {
    expect(actorSlug("Admin.Denzing@denzing.com")).toBe("admin-denzing-denzing-com");
  });
  it("falls back to 'unknown' for empty input", () => {
    expect(actorSlug("")).toBe("unknown");
  });
});

describe("auditRelPathFor", () => {
  it("builds a per-writer per-day path", () => {
    expect(auditRelPathFor("a@b.com", "2026-07-03")).toBe("audit/a-b-com-2026-07-03.jsonl");
  });
});

describe("append + read round-trip", () => {
  it("appends a line and reads it back", async () => {
    await appendAuditEntry(dir, entry());
    const rows = await readAuditEntries(dir);
    expect(rows).toHaveLength(1);
    expect(rows[0].tool).toBe("Write");
  });

  it("writes the file derived from actor + ts date", async () => {
    await appendAuditEntry(dir, entry());
    const files = await auditRelPaths(dir);
    expect(files).toEqual(["audit/a-b-com-2026-07-03.jsonl"]);
  });

  it("filters by feature and sorts newest-first", async () => {
    await appendAuditEntry(dir, entry({ ts: "2026-07-03T10:00:00.000Z", feature: "x" }));
    await appendAuditEntry(dir, entry({ ts: "2026-07-03T12:00:00.000Z", feature: "y" }));
    await appendAuditEntry(dir, entry({ ts: "2026-07-03T11:00:00.000Z", feature: "y" }));
    const rows = await readAuditEntries(dir, { feature: "y" });
    expect(rows.map((r) => r.ts)).toEqual([
      "2026-07-03T12:00:00.000Z", "2026-07-03T11:00:00.000Z",
    ]);
  });

  it("skips malformed lines instead of throwing", async () => {
    await appendAuditEntry(dir, entry());
    await fs.appendFile(path.join(dir, "audit", "a-b-com-2026-07-03.jsonl"), "not json\n");
    const rows = await readAuditEntries(dir);
    expect(rows).toHaveLength(1);
  });

  it("returns [] when no audit dir exists", async () => {
    expect(await readAuditEntries(dir)).toEqual([]);
    expect(await auditRelPaths(dir)).toEqual([]);
  });

  it("rejects an unsupported schema version", async () => {
    await expect(appendAuditEntry(dir, entry({ v: 2 as 1 }))).rejects.toThrow();
  });
});
