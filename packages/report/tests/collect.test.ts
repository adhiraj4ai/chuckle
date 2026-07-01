import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { VaultManager, readApproval, writeApproval, applyReviewerAction, hashContent, readWorkflows, writeWorkflows } from "@signoff/vault-core";
import { collectReport } from "../src/collect.js";

let project: string, vaultPath: string;
beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-report-"));
  vaultPath = path.join(project, ".signoff");
  await VaultManager.create(vaultPath, "proj");
  await fs.mkdir(path.join(project, "docs"), { recursive: true });
  // Disable spec diagram requirement so pre-diagram-gating tests can approve specs normally.
  const wf = await readWorkflows(vaultPath);
  wf.spec = { ...wf.spec, require_diagram: false };
  await writeWorkflows(vaultPath, wf);
});
afterEach(async () => { await fs.rm(project, { recursive: true, force: true }); });

async function approve(feature: string, type: "spec" | "plan", relPath: string): Promise<void> {
  await fs.writeFile(path.join(project, relPath), `# ${feature} ${type}`);
  const v = await VaultManager.open(vaultPath);
  await v.submitForReview(feature, type, relPath, "a@o.c", "A");
  const hash = hashContent(await fs.readFile(path.join(project, relPath)));
  let rec = await readApproval(vaultPath, feature, type);
  rec = applyReviewerAction(rec!, "a@o.c", "start_review", "2026-06-30T00:00:00Z", hash, null);
  rec = applyReviewerAction(rec, "a@o.c", "approve", "2026-06-30T00:01:00Z", hash, null);
  rec = { ...rec, status: "approved" };
  await writeApproval(vaultPath, rec);
}

async function submitOnly(feature: string, type: "spec" | "plan", relPath: string): Promise<void> {
  await fs.writeFile(path.join(project, relPath), `# ${feature} ${type}`);
  const v = await VaultManager.open(vaultPath);
  await v.submitForReview(feature, type, relPath, "a@o.c", "A");
}

describe("collectReport", () => {
  it("aggregates coverage, status breakdown, and stale flags", async () => {
    // alpha: spec approved, plan pending(submitted)
    await approve("alpha", "spec", "docs/alpha-spec.md");
    await submitOnly("alpha", "plan", "docs/alpha-plan.md");
    // beta: spec approved then edited (stale); no plan
    await approve("beta", "spec", "docs/beta-spec.md");
    await fs.writeFile(path.join(project, "docs/beta-spec.md"), "# beta spec EDITED");

    const r = await collectReport(vaultPath);

    expect(r.totals.features).toBe(2);
    expect(r.totals.approvedSpec).toBe(1);           // alpha spec (beta spec is stale → not approved)
    expect(r.totals.approvedPlan).toBe(0);
    expect(r.totals.stale).toBe(1);                  // beta spec
    // byStatus sums to 2 × features (4 docs counted incl. not_found)
    const sum = Object.values(r.totals.byStatus).reduce((a, b) => a + b, 0);
    expect(sum).toBe(4);
    expect(r.totals.byStatus.not_found).toBe(1);     // beta plan absent
    const beta = r.features.find((f) => f.name === "beta")!;
    expect(beta.specStale).toBe(true);
    expect(beta.plan).toBe("not_found");
  });

  it("0 features → empty report (no throw)", async () => {
    const r = await collectReport(vaultPath);
    expect(r.totals.features).toBe(0);
    expect(r.features).toEqual([]);
  });
});
