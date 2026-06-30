import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import {
  VaultManager,
  getApprovalStatus,
  readWorkflows,
  readApproval,
  writeApproval,
  applyReviewerAction,
  hashContent,
} from "../src/index.js";

let tmp: string, projectRoot: string, vaultPath: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-thr-"));
  projectRoot = path.join(tmp, "project");
  vaultPath = path.join(projectRoot, ".signoff");
  await fs.mkdir(path.join(projectRoot, "docs"), { recursive: true });
  await fs.writeFile(path.join(projectRoot, "docs", "x.md"), "# x");
  await VaultManager.create(vaultPath, "proj");
  const v = await VaultManager.open(vaultPath);
  await v.submitForReview("x", "spec", "docs/x.md", "a@o.c", "A");
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("getApprovalStatus honors threshold mode", () => {
  it("approves at 1-of-3 when approval_mode=threshold, min_approvals=1", async () => {
    // configure threshold, 3 required, min 1
    const wf = await readWorkflows(vaultPath);
    wf.spec.required_approvers = ["a@o.c", "b@o.c", "c@o.c"];
    wf.spec.min_approvals = 1;
    wf.spec.approval_mode = "threshold";
    await fs.writeFile(path.join(vaultPath, "workflows.json"), JSON.stringify(wf, null, 2) + "\n");

    // one fresh approval from a required reviewer
    const hash = hashContent(await fs.readFile(path.join(projectRoot, "docs", "x.md")));
    let rec = (await readApproval(vaultPath, "x", "spec"))!;
    rec = applyReviewerAction(rec, "a@o.c", "start_review", new Date().toISOString());
    rec = applyReviewerAction(rec, "a@o.c", "approve", new Date().toISOString(), hash);
    await writeApproval(vaultPath, rec);

    const res = await getApprovalStatus(vaultPath, "x", "spec");
    expect(res.status).toBe("approved");
  });

  it("stays in_review under unanimous default with only 1 of 3", async () => {
    // configure 3 required reviewers, no approval_mode (unanimous default)
    const wf = await readWorkflows(vaultPath);
    wf.spec.required_approvers = ["a@o.c", "b@o.c", "c@o.c"];
    // no approval_mode set => unanimous
    await fs.writeFile(path.join(vaultPath, "workflows.json"), JSON.stringify(wf, null, 2) + "\n");

    // one fresh approval from a required reviewer (only 1 of 3)
    const hash = hashContent(await fs.readFile(path.join(projectRoot, "docs", "x.md")));
    let rec = (await readApproval(vaultPath, "x", "spec"))!;
    rec = applyReviewerAction(rec, "a@o.c", "start_review", new Date().toISOString());
    rec = applyReviewerAction(rec, "a@o.c", "approve", new Date().toISOString(), hash);
    await writeApproval(vaultPath, rec);

    const res = await getApprovalStatus(vaultPath, "x", "spec");
    expect(res.status).toBe("in_review");
  });
});
