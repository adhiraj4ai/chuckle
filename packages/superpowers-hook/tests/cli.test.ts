import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, "..", "dist", "cli.js");

// Runs the CLI with the given stdin payload; resolves with { code, stderr, signal }.
// If the process exits normally, `code` is the numeric exit code.
// If the process is killed by a signal or exits with a non-numeric code (crash),
// `code` is -1 (sentinel) so block-expected tests cannot accidentally see 0.
function run(payload: string): Promise<{ code: number; stderr: string; signal: string | null }> {
  return new Promise((resolve) => {
    const child = execFile("node", [cli], (err, _stdout, stderr) => {
      if (!err) {
        resolve({ code: 0, stderr, signal: null });
        return;
      }
      const e = err as { code?: unknown; killed?: boolean; signal?: string | null };
      if (typeof e.code === "number") {
        resolve({ code: e.code, stderr, signal: e.signal ?? null });
      } else {
        // Process was signal-killed, crashed, or produced a non-numeric code — treat as error.
        resolve({ code: -1, stderr, signal: e.signal ?? null });
      }
    });
    child.stdin?.end(payload);
  });
}

beforeAll(async () => {
  // The CLI must be built before this test runs.
  await execFileAsync("npm", ["run", "build"], { cwd: path.join(here, "..") });
}, 30_000);

describe("chuckle-gate CLI", () => {
  it("exits 0 for an allowed target (spec doc)", async () => {
    const event = JSON.stringify({
      cwd: process.cwd(),
      tool_name: "Write",
      tool_input: { file_path: path.join(process.cwd(), "docs/superpowers/specs/x-design.md") },
    });
    const { code, stderr } = await run(event);
    expect(code).toBe(0);
    expect(stderr).toBe("");
  });

  it("exits 2 and prints a reason for a blocked target (code, no pointer)", async () => {
    const event = JSON.stringify({
      cwd: "/tmp/no-such-chuckle-project",
      tool_name: "Write",
      tool_input: { file_path: "/tmp/no-such-chuckle-project/src/index.ts" },
    });
    const { code, stderr } = await run(event);
    expect(code).toBe(2);
    expect(stderr).toMatch(/Signoff/);
  });

  it("exits 2 on malformed stdin (fail closed)", async () => {
    const { code } = await run("{ not json");
    expect(code).toBe(2);
  });
});
