import { describe, it, expect } from "vitest";
import { mergeSignoffSettings, removeSignoffSettings } from "../src/main/connect-claude.js";

const opts = { mcpCommand: "node", mcpArgs: ["/h/.signoff/tools/signoff-mcp.mjs", "--vault", "/p/.signoff"], hookCommand: 'node "/h/.signoff/tools/signoff-gate.mjs"' };

describe("mergeSignoffSettings (node runner)", () => {
  it("writes node-based mcp server + hook", () => {
    const m = mergeSignoffSettings({}, opts);
    expect(m.mcpServers!.signoff).toEqual({ command: "node", args: opts.mcpArgs });
    expect(m.hooks!.PreToolUse![0].hooks[0].command).toBe(opts.hookCommand);
    expect(m.hooks!.PreToolUse![0].matcher).toBe("Write|Edit|MultiEdit|NotebookEdit");
  });
  it("preserves unrelated keys and other hooks (non-clobber)", () => {
    const existing = { model: "x", mcpServers: { other: { command: "y" } }, hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] }] } } as any;
    const m = mergeSignoffSettings(existing, opts);
    expect(m.model).toBe("x");
    expect((m.mcpServers as any).other).toEqual({ command: "y" });
    expect(m.hooks!.PreToolUse!.some((e) => e.hooks[0].command === "echo hi")).toBe(true);
  });
  it("is idempotent and replaces a legacy npx hook entry", () => {
    const legacy = mergeSignoffSettings({}, { mcpCommand: "npx", mcpArgs: ["-y", "@signoff/mcp-server"], hookCommand: "npx -y @signoff/superpowers-hook" });
    const upgraded = mergeSignoffSettings(legacy, opts);
    const signoffHooks = upgraded.hooks!.PreToolUse!.filter((e) => e.hooks.some((h) => /signoff-gate|@signoff\/superpowers-hook/.test(h.command)));
    expect(signoffHooks).toHaveLength(1);
    expect(signoffHooks[0].hooks[0].command).toBe(opts.hookCommand);
  });
});

describe("removeSignoffSettings", () => {
  it("removes only signoff entries, keeps the rest", () => {
    const m = mergeSignoffSettings({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] }] } } as any, opts);
    const r = removeSignoffSettings(m);
    expect(r.mcpServers?.signoff).toBeUndefined();
    expect(r.hooks!.PreToolUse!.some((e) => e.hooks[0].command === "echo hi")).toBe(true);
    expect(r.hooks!.PreToolUse!.some((e) => /signoff-gate/.test(e.hooks[0].command))).toBe(false);
  });
  it("drops empty mcpServers/hooks containers", () => {
    const r = removeSignoffSettings(mergeSignoffSettings({}, opts));
    expect(r.mcpServers).toBeUndefined();
    expect(r.hooks).toBeUndefined();
  });
});
