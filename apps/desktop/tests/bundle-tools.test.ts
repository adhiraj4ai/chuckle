import { describe, it, expect } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs"; import path from "node:path"; import os from "node:os";
import { VaultManager } from "@signoff/vault-core";

const tools = path.resolve(__dirname, "..", "resources", "tools");
const gate = path.join(tools, "signoff-gate.mjs");
const mcp = path.join(tools, "signoff-mcp.mjs");

describe("bundled tools", () => {
  it("gate bundle runs under node and returns a decision for a sample event", () => {
    // No active feature / no vault ⇒ gate fails closed (exit 2). We only assert it RUNS
    // (bundle is not broken) and emits a SignOff message, not the specific decision.
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "signoff-smoke-"));
    const event = JSON.stringify({ cwd: project, tool_name: "Write", tool_input: { file_path: path.join(project, "src/x.ts") } });
    let out = "";
    try {
      out = execFileSync("node", [gate], { input: event, encoding: "utf-8" });
    } catch (e: any) {
      // exit code 2 (blocked) is expected; capture stderr+stdout to prove it ran
      out = String(e.stdout ?? "") + String(e.stderr ?? "");
    }
    expect(out).toMatch(/signoff|approval|gate|🔒/i);
  });
  it("mcp bundle actually STARTS (does not exit immediately) with a valid vault", async () => {
    // A CJS-broken bundle (empty import.meta.url) never runs main() and exits at once.
    // ESM bundle connects the stdio transport and stays alive.
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "signoff-mcp-smoke-"));
    await VaultManager.create(path.join(project, ".signoff"), "smoke");
    const child = spawn("node", [mcp, "--vault", path.join(project, ".signoff")], { stdio: ["pipe", "pipe", "pipe"] });
    await new Promise((r) => setTimeout(r, 800));
    const alive = child.exitCode === null && child.signalCode === null;
    child.kill("SIGKILL");
    expect(alive).toBe(true);
  }, 10000);
  it("ships the skill + version marker", () => {
    expect(fs.existsSync(path.join(tools, "SKILL.md"))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(tools, "version.json"), "utf-8")).version).toMatch(/\d+\.\d+\.\d+/);
  });
});
