#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

/**
 * Resolve the vault directory with this precedence:
 *   1. explicit `--vault <path>`
 *   2. `$CLAUDE_PROJECT_DIR/.signoff` (set by Claude Code for plugin/hook procs)
 *   3. `<cwd>/.signoff` (final fallback)
 * Pure + exported so it is unit-testable without spawning the process.
 */
export function resolveVaultPath(
  argv: string[],
  env: NodeJS.ProcessEnv,
  cwd: string
): string {
  const idx = argv.indexOf("--vault");
  if (idx !== -1 && idx + 1 < argv.length) return argv[idx + 1];
  if (env.CLAUDE_PROJECT_DIR) return path.join(env.CLAUDE_PROJECT_DIR, ".signoff");
  return path.join(cwd, ".signoff");
}

/**
 * Validate the --vault path at startup: it must exist, be a directory, and look
 * like a vault (have a config.json). Throws an Error with a clear message
 * otherwise so we never start a server pointed at a bogus path. Pure and
 * testable — the CLI entrypoint catches the throw and exits.
 */
export function validateVaultPath(vaultPath: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(vaultPath);
  } catch {
    throw new Error(`vault path does not exist: ${vaultPath}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`vault path is not a directory: ${vaultPath}`);
  }
  if (!fs.existsSync(path.join(vaultPath, "config.json"))) {
    throw new Error(`vault path is not a Signoff vault (no config.json): ${vaultPath}`);
  }
}

async function main() {
  const vaultPath = resolveVaultPath(process.argv.slice(2), process.env, process.cwd());
  try {
    validateVaultPath(vaultPath);
  } catch (err) {
    process.stderr.write(
      `Error: ${err instanceof Error ? err.message : String(err)}\n` +
        `Pass --vault <path>, set CLAUDE_PROJECT_DIR, or run from a project containing .signoff.\n`
    );
    process.exit(1);
  }
  const server = createServer(vaultPath);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only bootstrap the server when run as the CLI entrypoint, not when this
// module is imported (e.g. by tests exercising validateVaultPath).
const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((err) => {
    process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
