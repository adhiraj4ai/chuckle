import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { signoffHome, writeFileAtomic } from "@signoff/vault-core";
import { mergeSignoffSettings, removeSignoffSettings, type ClaudeSettings } from "./connect-claude.js";

const execFileP = promisify(execFile);

export interface InstallStatus {
  gate: "not_installed" | "installed" | "outdated";
  skill: "not_installed" | "installed";
  installedVersion: string | null;
  appVersion: string | null;
  nodeAvailable: boolean;
}
export interface Components { gate: boolean; skill: boolean }

// The main process is bundled as ESM, so `__dirname` is unavailable; derive the
// on-disk location of this module the same way `main/index.ts` derives its app dir.
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Bundled-tools source directory.
 *
 * Resolution order:
 * 1. `SIGNOFF_TOOLS_DIR` (test/override seam, always set under Vitest)
 * 2. Dev mode (ELECTRON_RENDERER_URL set by electron-vite dev) → repo `resources/tools`
 *    (Note: process.resourcesPath is also set in dev, pointing at Electron's own resources
 *    which lack a `tools/` dir, so we check ELECTRON_RENDERER_URL first)
 * 3. Packaged app (`process.resourcesPath/tools`, populated by electron-builder's `extraResources`)
 * 4. Fallback (plain Node, no Electron) → repo path
 *
 * We deliberately avoid importing `electron` here: this module runs under plain
 * Node in tests (no electron binary present) and the `SIGNOFF_TOOLS_DIR` seam
 * already makes the packaged/dev branches unreachable in that environment.
 */
export function toolsSourceDir(): string {
  // 1. Explicit override (tests, advanced setups).
  if (process.env.SIGNOFF_TOOLS_DIR) return process.env.SIGNOFF_TOOLS_DIR;
  // 2. Dev: electron-vite dev sets ELECTRON_RENDERER_URL — use the repo's bundled tools,
  //    NOT process.resourcesPath (which points at Electron's own resources in dev).
  if (process.env.ELECTRON_RENDERER_URL) return path.resolve(moduleDir, "..", "..", "resources", "tools");
  // 3. Packaged: electron-builder extraResources → process.resourcesPath/tools
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) return path.join(resourcesPath, "tools");
  // 4. Fallback (plain node, no electron): repo path.
  return path.resolve(moduleDir, "..", "..", "resources", "tools");
}

export function installedToolsDir(): string {
  return path.join(signoffHome(), "tools");
}

async function readVersion(dir: string): Promise<string | null> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(dir, "version.json"), "utf-8")) as { version?: string };
    return raw.version ?? null;
  } catch {
    return null;
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function nodeAvailable(): Promise<boolean> {
  try {
    await execFileP("node", ["-v"]);
    return true;
  } catch {
    return false;
  }
}

export async function copyTools(): Promise<void> {
  const src = toolsSourceDir();
  const dst = installedToolsDir();
  await fs.mkdir(dst, { recursive: true });
  for (const f of ["signoff-mcp.mjs", "signoff-gate.mjs", "version.json"]) {
    await fs.copyFile(path.join(src, f), path.join(dst, f));
  }
}

function q(p: string): string {
  return `"${p}"`;
}

async function readSettings(projectRoot: string): Promise<ClaudeSettings> {
  try {
    return JSON.parse(await fs.readFile(path.join(projectRoot, ".claude", "settings.json"), "utf-8")) as ClaudeSettings;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
}

async function writeSettings(projectRoot: string, s: ClaudeSettings): Promise<void> {
  const dir = path.join(projectRoot, ".claude");
  await fs.mkdir(dir, { recursive: true });
  await writeFileAtomic(path.join(dir, "settings.json"), JSON.stringify(s, null, 2) + "\n");
}

/**
 * Install the requested components into a project: the gate copies the bundled
 * MCP server + PreToolUse hook tools into `~/.signoff/tools` and wires
 * `.claude/settings.json` to invoke them via `node`; the skill copies the
 * workflow skill into `.claude/skills/signoff`. Both are idempotent — re-running
 * replaces rather than duplicates.
 */
export async function applyInstall(projectRoot: string, vaultPath: string, c: Components): Promise<InstallStatus> {
  if (c.gate) {
    if (!(await nodeAvailable())) {
      throw new Error("Node.js is required on your PATH to run the SignOff gate. Install Node.js and try again.");
    }
    await copyTools();
    const mcp = path.join(installedToolsDir(), "signoff-mcp.mjs");
    const gate = path.join(installedToolsDir(), "signoff-gate.mjs");
    const merged = mergeSignoffSettings(await readSettings(projectRoot), {
      mcpCommand: "node",
      mcpArgs: [mcp, "--vault", vaultPath],
      hookCommand: `node ${q(gate)}`,
    });
    await writeSettings(projectRoot, merged);
  }
  if (c.skill) {
    const dst = path.join(projectRoot, ".claude", "skills", "signoff");
    await fs.mkdir(dst, { recursive: true });
    await fs.copyFile(path.join(toolsSourceDir(), "SKILL.md"), path.join(dst, "SKILL.md"));
  }
  return installStatus(projectRoot);
}

/** Remove the requested components from a project, leaving unrelated settings untouched. */
export async function removeInstall(projectRoot: string, c: Components): Promise<InstallStatus> {
  if (c.gate) {
    if (await exists(path.join(projectRoot, ".claude", "settings.json"))) {
      await writeSettings(projectRoot, removeSignoffSettings(await readSettings(projectRoot)));
    }
  }
  if (c.skill) {
    await fs.rm(path.join(projectRoot, ".claude", "skills", "signoff"), { recursive: true, force: true });
  }
  return installStatus(projectRoot);
}

/** Report the current install state of a project without mutating anything. */
export async function installStatus(projectRoot: string): Promise<InstallStatus> {
  const appVersion = await readVersion(toolsSourceDir());
  const installedVersion = await readVersion(installedToolsDir());
  const s = await readSettings(projectRoot);
  const mcp = (s.mcpServers as Record<string, { args?: string[] }> | undefined)?.signoff;
  const pointsAtInstalled = !!mcp?.args?.some((a) => a === path.join(installedToolsDir(), "signoff-mcp.mjs"));

  let gate: InstallStatus["gate"] = "not_installed";
  if (pointsAtInstalled) {
    gate = installedVersion && appVersion && installedVersion !== appVersion ? "outdated" : "installed";
  }

  const skill: InstallStatus["skill"] = (await exists(path.join(projectRoot, ".claude", "skills", "signoff", "SKILL.md")))
    ? "installed"
    : "not_installed";

  return { gate, skill, installedVersion, appVersion, nodeAvailable: await nodeAvailable() };
}
