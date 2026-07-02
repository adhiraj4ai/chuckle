import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readAuditEntries } from "@signoff/vault-core";
import { recordGateDecision } from "../src/recorder.js";
import type { PreToolUseEvent } from "../src/types.js";

let cwd: string;
beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-gate-"));
  await fs.mkdir(path.join(cwd, ".signoff"), { recursive: true });
});
afterEach(async () => { await fs.rm(cwd, { recursive: true, force: true }); });

function ev(over: Partial<PreToolUseEvent> = {}): PreToolUseEvent {
  return { cwd, tool_name: "Write", tool_input: {}, session_id: "sess-1", ...over };
}

describe("recordGateDecision", () => {
  it("records a block decision into <cwd>/.signoff/audit", async () => {
    await recordGateDecision(ev(), { allow: false, feature: "user-auth" });
    const rows = await readAuditEntries(path.join(cwd, ".signoff"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "gate", tool: "Write", decision: "block", feature: "user-auth",
      session_id: "sess-1", repo: path.basename(cwd),
    });
  });

  it("records an allow decision", async () => {
    await recordGateDecision(ev({ tool_name: "Edit" }), { allow: true });
    const rows = await readAuditEntries(path.join(cwd, ".signoff"));
    expect(rows[0]).toMatchObject({ decision: "allow", tool: "Edit" });
  });

  it("is fail-open: a write failure does not throw", async () => {
    // Point at a cwd whose .signoff is a FILE, so mkdir/append fails internally.
    const bad = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-bad-"));
    await fs.writeFile(path.join(bad, ".signoff"), "not a dir");
    await expect(
      recordGateDecision({ cwd: bad, tool_name: "Write", tool_input: {} }, { allow: true }),
    ).resolves.toBeUndefined();
    await fs.rm(bad, { recursive: true, force: true });
  });
});
