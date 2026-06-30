import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkg = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const skill = fs.readFileSync(path.join(pkg, "skills", "signoff", "SKILL.md"), "utf-8");

describe("SKILL.md ADR guidance", () => {
  it("instructs publishing an ADR and states it is non-blocking", () => {
    expect(skill).toMatch(/publish_document\([^)]*["']adr["']/);
    expect(skill.toLowerCase()).toMatch(/non-blocking|does not block|never blocks/);
  });
});
