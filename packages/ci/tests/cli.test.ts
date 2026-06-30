import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { VaultManager, readApproval, writeApproval, applyReviewerAction, hashContent } from "@signoff/vault-core";
import { cmdCheck, cmdCloneVault } from "../src/cli.js";

let project: string;
beforeEach(async () => { project = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-cli-")); });
afterEach(async () => { await fs.rm(project, { recursive: true, force: true }); });

async function approvedPlan(): Promise<void> {
  const vaultPath = path.join(project, ".signoff");
  await VaultManager.create(vaultPath, "proj");
  await fs.mkdir(path.join(project, "docs"), { recursive: true });
  await fs.writeFile(path.join(project, "docs", "x.md"), "# plan");
  const v = await VaultManager.open(vaultPath);
  await v.submitForReview("x", "plan", "docs/x.md", "a@o.c", "A");
  const hash = hashContent(await fs.readFile(path.join(project, "docs", "x.md")));
  let rec = await readApproval(vaultPath, "x", "plan");
  rec = applyReviewerAction(rec!, "a@o.c", "start_review", "2026-06-30T00:00:00Z", hash, null);
  rec = applyReviewerAction(rec, "a@o.c", "approve", "2026-06-30T00:01:00Z", hash, null);
  await writeApproval(vaultPath, rec);
}

describe("cmdCheck exit codes", () => {
  it("returns 0 when the resolved feature's plan is approved", async () => {
    await approvedPlan();
    const code = await cmdCheck([], { SIGNOFF_FEATURE: "x", SIGNOFF_TYPE: "plan" }, project);
    expect(code).toBe(0);
  });
  it("returns 1 when not approved", async () => {
    const vaultPath = path.join(project, ".signoff");
    await VaultManager.create(vaultPath, "proj");
    const code = await cmdCheck([], { SIGNOFF_FEATURE: "ghost" }, project);
    expect(code).toBe(1);
  });
  it("returns 2 when the feature cannot be resolved", async () => {
    const code = await cmdCheck([], { SIGNOFF_BRANCH: "main" }, project);
    expect(code).toBe(2);
  });
  it("resolves the feature from the branch env when no explicit feature", async () => {
    await approvedPlan();
    const code = await cmdCheck([], { SIGNOFF_BRANCH: "feat/x", SIGNOFF_TYPE: "plan" }, project);
    expect(code).toBe(0);
  });
});

describe("cmdCloneVault exit codes", () => {
  it("cmdCloneVault returns 2 on missing url/dest", async () => {
    const code = await cmdCloneVault([], {});
    expect(code).toBe(2);
  });
});
