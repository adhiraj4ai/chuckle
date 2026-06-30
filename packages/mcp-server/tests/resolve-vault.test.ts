import { describe, it, expect } from "vitest";
import path from "node:path";
import { resolveVaultPath } from "../src/index.js";

describe("resolveVaultPath", () => {
  it("prefers an explicit --vault argument", () => {
    expect(resolveVaultPath(["--vault", "/abs/vault"], {}, "/cwd")).toBe("/abs/vault");
  });

  it("falls back to CLAUDE_PROJECT_DIR/.signoff", () => {
    expect(resolveVaultPath([], { CLAUDE_PROJECT_DIR: "/proj" }, "/cwd")).toBe(
      path.join("/proj", ".signoff")
    );
  });

  it("falls back to cwd/.signoff when neither is set", () => {
    expect(resolveVaultPath([], {}, "/cwd")).toBe(path.join("/cwd", ".signoff"));
  });

  it("ignores a trailing --vault with no value and uses the next fallback", () => {
    expect(resolveVaultPath(["--vault"], { CLAUDE_PROJECT_DIR: "/proj" }, "/cwd")).toBe(
      path.join("/proj", ".signoff")
    );
  });
});
