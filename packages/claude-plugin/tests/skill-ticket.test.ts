import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkg = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const skill = fs.readFileSync(path.join(pkg, "skills", "signoff", "SKILL.md"), "utf-8");

describe("SKILL.md ticket guidance", () => {
  it("mentions passing a ticket on publish", () => {
    expect(skill.toLowerCase()).toContain("ticket");
    expect(skill).toContain("ticket_id");
  });
});
