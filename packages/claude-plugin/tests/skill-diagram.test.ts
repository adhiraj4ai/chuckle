import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkg = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const skill = fs.readFileSync(path.join(pkg, "skills", "signoff", "SKILL.md"), "utf-8");

describe("SKILL.md diagram guidance", () => {
  it("tells Claude a diagram may be required and to include a mermaid diagram", () => {
    expect(skill.toLowerCase()).toContain("diagram");
    expect(skill.toLowerCase()).toContain("mermaid");
  });
});
