import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { VaultManager, getApprovalStatus, readApproval, writeApproval, applyReviewerAction, deriveStatus, readWorkflows, hashContent } from "../src/index.js";

let tmp: string, projectRoot: string, vaultPath: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "review-status-"));
  projectRoot = path.join(tmp, "project");
  vaultPath = path.join(projectRoot, ".signoff");
  await fs.mkdir(path.join(projectRoot, "docs"), { recursive: true });
  await fs.writeFile(path.join(projectRoot, "docs", "a.md"), "# A\n");
  await VaultManager.create(vaultPath, "p");
  const v = await VaultManager.open(vaultPath);
  await v.submitForReview("auth", "spec", "docs/a.md", "dev@o.c", "Dev");
});
afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

describe("getApprovalStatus (derived)", () => {
  it("submit initializes an empty reviewers map and pending status", async () => {
    const rec = await readApproval(vaultPath, "auth", "spec");
    expect(rec?.reviewers).toEqual({});
    expect((await getApprovalStatus(vaultPath, "auth", "spec")).status).toBe("pending");
  });

  it("derives approved only when the required reviewer approves the current content", async () => {
    // make the lone required approver = dev@o.c
    const wf = await readWorkflows(vaultPath);
    wf.spec.required_approvers = ["dev@o.c"];
    await fs.writeFile(path.join(vaultPath, "workflows.json"), JSON.stringify(wf, null, 2) + "\n");

    const hash = hashContent(await fs.readFile(path.join(projectRoot, "docs", "a.md")));
    let rec = (await readApproval(vaultPath, "auth", "spec"))!;
    rec = applyReviewerAction(rec, "dev@o.c", "start_review", "t1");
    rec = applyReviewerAction(rec, "dev@o.c", "approve", "t2", hash);
    rec.status = deriveStatus(rec, ["dev@o.c"], hash);
    await writeApproval(vaultPath, rec);

    expect((await getApprovalStatus(vaultPath, "auth", "spec")).status).toBe("approved");

    // editing the doc invalidates the approval
    await fs.writeFile(path.join(projectRoot, "docs", "a.md"), "# A changed\n");
    expect((await getApprovalStatus(vaultPath, "auth", "spec")).status).toBe("in_review");
  });
});
