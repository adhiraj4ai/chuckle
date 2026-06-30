import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import {
  VaultManager,
  readApproval,
  writeApproval,
  applyReviewerAction,
  hashContent,
  readWorkflows,
  writeWorkflows,
  readManifest,
  writeManifest,
  setFeatureTier,
  getApprovalStatus,
  isClearedForCode,
} from "../src/index.js";

let project: string, vaultPath: string;
beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-tier-"));
  vaultPath = path.join(project, ".signoff");
  await VaultManager.create(vaultPath, "proj");
  await fs.mkdir(path.join(project, "docs"), { recursive: true });
});
afterEach(async () => { await fs.rm(project, { recursive: true, force: true }); });

async function approve(feature: "x", type: "spec" | "plan", who: string[], mode: "unanimous" | "threshold", min: number): Promise<void> {
  const rel = `docs/${feature}-${type}.md`;
  await fs.writeFile(path.join(project, rel), `# ${type}`);
  const v = await VaultManager.open(vaultPath);
  await v.submitForReview(feature, type, rel, "a@o.c", "A");
  const wf = await readWorkflows(vaultPath);
  wf[type].required_approvers = who; wf[type].min_approvals = min; wf[type].approval_mode = mode;
  await writeWorkflows(vaultPath, wf);
  const hash = hashContent(await fs.readFile(path.join(project, rel)));
  let rec = await readApproval(vaultPath, feature, type);
  rec = applyReviewerAction(rec!, who[0], "start_review", "2026-07-01T00:00:00Z", hash, null);
  rec = applyReviewerAction(rec, who[0], "approve", "2026-07-01T00:01:00Z", hash, null);
  rec = { ...rec, status: "approved" };
  await writeApproval(vaultPath, rec);
}

describe("getApprovalStatus forceMode", () => {
  it("threshold workflow approves at 1-of-3 normally, but not under forceMode unanimous", async () => {
    await approve("x", "plan", ["a@o.c", "b@o.c", "c@o.c"], "threshold", 1);
    expect((await getApprovalStatus(vaultPath, "x", "plan")).status).toBe("approved");
    expect((await getApprovalStatus(vaultPath, "x", "plan", { forceMode: "unanimous" })).status).toBe("in_review");
  });
});

describe("isClearedForCode", () => {
  it("light: cleared once the spec is approved (no plan needed)", async () => {
    await approve("x", "spec", ["a@o.c"], "unanimous", 1);
    let m = await readManifest(vaultPath); m = setFeatureTier(m, "x", "light"); await writeManifest(vaultPath, m);
    const c = await isClearedForCode(vaultPath, "x");
    expect(c).toMatchObject({ cleared: true, tier: "light", artifact: "spec" });
  });
  it("standard (unset): not cleared until the plan is approved", async () => {
    await approve("x", "spec", ["a@o.c"], "unanimous", 1);
    const c = await isClearedForCode(vaultPath, "x"); // no tier ⇒ standard ⇒ needs plan
    expect(c.tier).toBe("standard"); expect(c.artifact).toBe("plan"); expect(c.cleared).toBe(false);
  });
  it("heavy: not cleared at 1-of-3 even under threshold mode", async () => {
    await approve("x", "plan", ["a@o.c", "b@o.c", "c@o.c"], "threshold", 1);
    let m = await readManifest(vaultPath); m = setFeatureTier(m, "x", "heavy"); await writeManifest(vaultPath, m);
    const c = await isClearedForCode(vaultPath, "x");
    expect(c.tier).toBe("heavy"); expect(c.cleared).toBe(false);
  });
});
