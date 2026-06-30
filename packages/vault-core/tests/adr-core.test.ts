import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os"; import path from "node:path"; import fs from "node:fs/promises";
import { VaultManager, readWorkflows, readManifest, getApprovalStatus } from "../src/index.js";

let project: string, vaultPath: string;
beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-adr-"));
  vaultPath = path.join(project, ".signoff");
  await VaultManager.create(vaultPath, "proj");
  await fs.mkdir(path.join(project, "docs"), { recursive: true });
});
afterEach(async () => { await fs.rm(project, { recursive: true, force: true }); });

describe("adr workflow backfill", () => {
  it("readWorkflows backfills a default adr workflow when workflows.json lacks one", async () => {
    // simulate a pre-ADR vault: write workflows.json with only spec + plan
    await fs.writeFile(path.join(vaultPath, "workflows.json"), JSON.stringify({
      spec: { required_approvers: [], min_approvals: 1, approval_mode: "unanimous" },
      plan: { required_approvers: [], min_approvals: 1, approval_mode: "unanimous" },
    }));
    const wf = await readWorkflows(vaultPath);
    expect(wf.adr).toBeDefined();
    expect(wf.adr.required_approvers).toEqual([]);
    expect(wf.adr.min_approvals).toBe(1);
    expect(wf.adr.approval_mode).toBe("unanimous");
  });
  it("preserves an explicitly-set adr workflow", async () => {
    await fs.writeFile(path.join(vaultPath, "workflows.json"), JSON.stringify({
      spec: { required_approvers: [], min_approvals: 1 },
      plan: { required_approvers: [], min_approvals: 1 },
      adr: { required_approvers: ["arch@o.c"], min_approvals: 1, approval_mode: "unanimous" },
    }));
    const wf = await readWorkflows(vaultPath);
    expect(wf.adr.required_approvers).toEqual(["arch@o.c"]);
  });
});

describe("adr document type round-trips", () => {
  it("submitForReview registers an adr doc and getApprovalStatus reads it", async () => {
    await fs.writeFile(path.join(project, "docs/x-adr.md"), "# Decision: use Postgres");
    const v = await VaultManager.open(vaultPath);
    await v.submitForReview("x", "adr", "docs/x-adr.md", "a@o.c", "A");
    const m = await readManifest(vaultPath);
    expect(m.features.x.adr).toBe("docs/x-adr.md");
    const res = await getApprovalStatus(vaultPath, "x", "adr");
    expect(res.status).toBe("pending"); // submitted, not yet approved
  });
});
