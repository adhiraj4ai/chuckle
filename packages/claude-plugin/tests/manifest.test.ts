import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkg = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const repoRoot = path.resolve(pkg, "..", "..");
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf-8"));

describe("plugin manifest", () => {
  it("plugin.json has required fields and references existing files", () => {
    const m = readJson(path.join(pkg, ".claude-plugin", "plugin.json"));
    expect(m.name).toBe("signoff");
    expect(typeof m.version).toBe("string");
    expect(fs.existsSync(path.join(pkg, m.mcpServers))).toBe(true);
    expect(fs.existsSync(path.join(pkg, m.hooks))).toBe(true);
    expect(fs.existsSync(path.join(pkg, "skills", "signoff", "SKILL.md"))).toBe(true);
  });

  it(".mcp.json points the signoff server at the project vault", () => {
    const m = readJson(path.join(pkg, ".mcp.json"));
    const args = m.mcpServers.signoff.args as string[];
    expect(m.mcpServers.signoff.command).toBe("npx");
    expect(args).toContain("--vault");
    expect(args.some((a) => a.includes("@signoff/mcp-server"))).toBe(true);
    expect(args.some((a) => a.includes("${CLAUDE_PROJECT_DIR}/.signoff"))).toBe(true);
  });

  it("hooks.json gates the structured edit tools", () => {
    const m = readJson(path.join(pkg, "hooks", "hooks.json"));
    const entry = m.PreToolUse[0];
    expect(entry.matcher).toBe("Write|Edit|MultiEdit|NotebookEdit");
    expect(entry.hooks[0].command).toContain("@signoff/superpowers-hook");
  });

  it("repo marketplace.json lists the plugin with an existing source dir", () => {
    const m = readJson(path.join(repoRoot, ".claude-plugin", "marketplace.json"));
    const plugin = m.plugins.find((p: { name: string }) => p.name === "signoff");
    expect(plugin).toBeTruthy();
    expect(fs.existsSync(path.join(repoRoot, plugin.source))).toBe(true);
  });
});
