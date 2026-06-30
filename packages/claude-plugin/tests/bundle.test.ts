import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const gate = path.join(root, "dist", "gate.mjs");
const mcp = path.join(root, "dist", "mcp.mjs");

/** Run a bundled entrypoint, returning its exit code (and stdin if provided). */
async function runNode(file: string, stdin?: string, env?: NodeJS.ProcessEnv, cwd?: string): Promise<number> {
  return new Promise((resolve) => {
    const child = execFile("node", [file], { env: { ...process.env, ...env }, cwd }, () => {});
    if (stdin !== undefined) {
      child.stdin?.end(stdin);
    }
    child.on("close", (code) => resolve(code ?? -1));
  });
}

beforeAll(async () => {
  await exec("node", ["build.mjs"], { cwd: root });
});

describe("bundled plugin binaries", () => {
  it("gate.mjs allows a write under .signoff (exit 0)", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-gate-"));
    const event = JSON.stringify({
      cwd,
      tool_name: "Write",
      tool_input: { file_path: path.join(cwd, ".signoff", "x.json") },
    });
    const code = await runNode(gate, event);
    expect(code).toBe(0);
  });

  it("mcp.mjs exits 1 when no vault can be found", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-mcp-"));
    // no --vault, no CLAUDE_PROJECT_DIR; resolves to cwd/.signoff which is absent
    const code = await runNode(mcp, undefined, { CLAUDE_PROJECT_DIR: "" }, cwd);
    // run with cwd set so the fallback points at the empty temp dir
    expect(code).toBe(1); // clean validate failure
  });
});
