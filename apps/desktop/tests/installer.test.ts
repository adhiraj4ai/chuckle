import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os"; import path from "node:path"; import fs from "node:fs/promises";
import { applyInstall, removeInstall, installStatus, installedToolsDir, toolsSourceDir } from "../src/main/installer.js";

let tmp: string, project: string, home: string, toolsSrc: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-inst-"));
  project = path.join(tmp, "proj"); home = path.join(tmp, "home"); toolsSrc = path.join(tmp, "src-tools");
  await fs.mkdir(path.join(project, ".signoff"), { recursive: true });
  await fs.mkdir(toolsSrc, { recursive: true });
  // fake bundled tools source
  for (const f of ["signoff-mcp.mjs", "signoff-gate.mjs"]) await fs.writeFile(path.join(toolsSrc, f), "// bundle");
  await fs.writeFile(path.join(toolsSrc, "SKILL.md"), "# skill");
  await fs.writeFile(path.join(toolsSrc, "version.json"), JSON.stringify({ version: "0.2.0" }));
  process.env.SIGNOFF_HOME = home;
  process.env.SIGNOFF_TOOLS_DIR = toolsSrc;   // test seam consumed by toolsSourceDir()
});
afterEach(async () => { delete process.env.SIGNOFF_HOME; delete process.env.SIGNOFF_TOOLS_DIR; await fs.rm(tmp, { recursive: true, force: true }); });

const vaultPath = () => path.join(project, ".signoff");
const settings = async () => JSON.parse(await fs.readFile(path.join(project, ".claude", "settings.json"), "utf-8"));

describe("toolsSourceDir", () => {
  it("toolsSourceDir uses the repo resources dir in dev (ELECTRON_RENDERER_URL set, no override)", () => {
    const prevTools = process.env.SIGNOFF_TOOLS_DIR;
    const prevRenderer = process.env.ELECTRON_RENDERER_URL;
    delete process.env.SIGNOFF_TOOLS_DIR;
    process.env.ELECTRON_RENDERER_URL = "http://localhost:5173";
    try {
      expect(toolsSourceDir().replace(/\\/g, "/")).toMatch(/apps\/desktop\/resources\/tools$/);
    } finally {
      if (prevTools === undefined) delete process.env.SIGNOFF_TOOLS_DIR;
      else process.env.SIGNOFF_TOOLS_DIR = prevTools;
      if (prevRenderer === undefined) delete process.env.ELECTRON_RENDERER_URL;
      else process.env.ELECTRON_RENDERER_URL = prevRenderer;
    }
  });
});

describe("applyInstall", () => {
  it("gate: copies tools to ~/.signoff/tools and writes node-based settings", async () => {
    const st = await applyInstall(project, vaultPath(), { gate: true, skill: false });
    expect(st.gate).toBe("installed");
    // tools copied
    expect(await fs.readFile(path.join(installedToolsDir(), "signoff-mcp.mjs"), "utf-8")).toContain("// bundle");
    const s = await settings();
    expect(s.mcpServers.signoff.command).toBe("node");
    expect(s.mcpServers.signoff.args[0]).toBe(path.join(installedToolsDir(), "signoff-mcp.mjs"));
    expect(s.mcpServers.signoff.args).toContain(vaultPath());
    expect(s.hooks.PreToolUse[0].hooks[0].command).toContain(path.join(installedToolsDir(), "signoff-gate.mjs"));
  });
  it("skill: copies SKILL.md into .claude/skills/signoff", async () => {
    const st = await applyInstall(project, vaultPath(), { gate: false, skill: true });
    expect(st.skill).toBe("installed");
    expect(await fs.readFile(path.join(project, ".claude", "skills", "signoff", "SKILL.md"), "utf-8")).toContain("# skill");
  });
  it("is idempotent (re-install does not duplicate)", async () => {
    await applyInstall(project, vaultPath(), { gate: true, skill: false });
    await applyInstall(project, vaultPath(), { gate: true, skill: false });
    expect((await settings()).hooks.PreToolUse.filter((e: any) => /signoff-gate/.test(e.hooks[0].command))).toHaveLength(1);
  });
});

describe("installStatus", () => {
  it("reports not_installed initially, installed after, outdated on version drift", async () => {
    expect((await installStatus(project)).gate).toBe("not_installed");
    await applyInstall(project, vaultPath(), { gate: true, skill: true });
    expect((await installStatus(project)).gate).toBe("installed");
    expect((await installStatus(project)).skill).toBe("installed");
    // simulate app upgrade: source version bumps
    await fs.writeFile(path.join(toolsSrc, "version.json"), JSON.stringify({ version: "0.3.0" }));
    expect((await installStatus(project)).gate).toBe("outdated");
  });
});

describe("removeInstall", () => {
  it("removes gate + skill, leaving a clean project", async () => {
    await applyInstall(project, vaultPath(), { gate: true, skill: true });
    const st = await removeInstall(project, { gate: true, skill: true });
    expect(st.gate).toBe("not_installed");
    expect(st.skill).toBe("not_installed");
    const s = await settings();
    expect(s.mcpServers?.signoff).toBeUndefined();
  });
});
