import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(new URL("../package.json", import.meta.url))), "..", "..");
const wf = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "signoff-check.yml"), "utf-8");

describe("signoff-check reusable workflow", () => {
  it("is a workflow_call workflow with the required inputs + secret", () => {
    expect(wf).toMatch(/workflow_call:/);
    expect(wf).toMatch(/vault_url:/);
    expect(wf).toMatch(/feature:/);
    expect(wf).toMatch(/vault_token:/);
  });
  it("does NOT declare a type input or SIGNOFF_TYPE env (tier decides the artifact)", () => {
    // There must be no 'type' as an input key (indented 6 spaces under inputs:)
    // Note: 'type: string' as a field attribute is fine — we target the input name
    expect(wf).not.toMatch(/^      type:\s*$/m);
    expect(wf).not.toMatch(/SIGNOFF_TYPE/);
  });
  it("defines the signoff job that clones the vault and runs the check", () => {
    expect(wf).toMatch(/^\s{2}signoff:/m);
    expect(wf).toMatch(/npx -y @signoff\/ci clone-vault/);
    expect(wf).toMatch(/npx -y @signoff\/ci check/);
    expect(wf).toMatch(/::add-mask::/);
  });
});
