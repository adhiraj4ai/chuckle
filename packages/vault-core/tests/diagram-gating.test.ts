import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os"; import path from "node:path"; import fs from "node:fs/promises";
import {
  VaultManager, readWorkflows, writeWorkflows, readManifest, writeManifest,
  setFeatureDoc, writeApproval, getApprovalStatus, isClearedForCode, deriveStatus,
} from "../src/index.js";
import { hashContent } from "../src/manifest.js";
import type { ApprovalRecord } from "../src/index.js";

const NOW = "2026-07-01T00:00:00.000Z";
const WITH = "# Plan\n\n```mermaid\ngraph TD; A-->B\n```\n";
const WITHOUT = "# Plan\n\njust prose, no diagram\n";

let project: string, vaultPath: string;
beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-diag-"));
  vaultPath = path.join(project, ".signoff");
  await VaultManager.create(vaultPath, "proj");
  await fs.mkdir(path.join(project, "docs"), { recursive: true });
});
afterEach(async () => { await fs.rm(project, { recursive: true, force: true }); });

// Register a doc on disk + in the manifest + a reviewer-approved record whose
// content_hash matches the file (so the approval is FRESH, isolating the diagram check).
async function approvedDocOnDisk(feature: string, type: "spec" | "plan" | "adr", content: string): Promise<void> {
  const rel = `docs/${feature}-${type}.md`;
  await fs.writeFile(path.join(project, rel), content);
  await writeManifest(vaultPath, setFeatureDoc(await readManifest(vaultPath), feature, type, rel));
  const hash = hashContent(Buffer.from(content));
  const record: ApprovalRecord = {
    document: rel, feature, type, workflow: type, status: "approved",
    reviewers: { "r@o.c": { status: "approved", content_hash: hash, at: NOW } },
    history: [
      { action: "submitted", by: "a@o.c", at: NOW, message: null },
      { action: "approved", by: "r@o.c", at: NOW, message: null, content_hash: hash },
    ],
  };
  await writeApproval(vaultPath, record);
}

async function setRequireDiagram(type: "spec" | "plan" | "adr", on: boolean): Promise<void> {
  const wf = await readWorkflows(vaultPath);
  wf[type] = { ...wf[type], require_diagram: on };
  await writeWorkflows(vaultPath, wf);
}

describe("deriveStatus diagramOk gate", () => {
  const approvedRecord: ApprovalRecord = {
    document: "d", feature: "f", type: "plan", workflow: "plan", status: "approved",
    reviewers: { "r@o.c": { status: "approved", at: NOW } },
    history: [{ action: "approved", by: "r@o.c", at: NOW, message: null }],
  };
  it("demotes an otherwise-approved doc to in_review when diagramOk is false", () => {
    expect(deriveStatus(approvedRecord, [], null, { diagramOk: false })).toBe("in_review");
  });
  it("returns approved when diagramOk is true", () => {
    expect(deriveStatus(approvedRecord, [], null, { diagramOk: true })).toBe("approved");
  });
  it("returns approved when diagramOk is omitted (default true)", () => {
    expect(deriveStatus(approvedRecord, [], null)).toBe("approved");
  });
  it("does not affect a pending doc", () => {
    const pending: ApprovalRecord = { ...approvedRecord, status: "pending", reviewers: {}, history: [] };
    expect(deriveStatus(pending, [], null, { diagramOk: false })).toBe("pending");
  });
});

describe("getApprovalStatus with require_diagram", () => {
  it("blocks approval (in_review + missing_diagram) when required and no diagram", async () => {
    await approvedDocOnDisk("x", "plan", WITHOUT);
    await setRequireDiagram("plan", true);
    const res = await getApprovalStatus(vaultPath, "x", "plan");
    expect(res.status).toBe("in_review");
    expect(res.missing_diagram).toBe(true);
  });
  it("approves when required and a diagram is present", async () => {
    await approvedDocOnDisk("x", "plan", WITH);
    await setRequireDiagram("plan", true);
    const res = await getApprovalStatus(vaultPath, "x", "plan");
    expect(res.status).toBe("approved");
    expect(res.missing_diagram).toBeUndefined();
  });
  it("is unchanged (approved, no flag) when require_diagram is off", async () => {
    await approvedDocOnDisk("x", "plan", WITHOUT);
    const res = await getApprovalStatus(vaultPath, "x", "plan");
    expect(res.status).toBe("approved");
    expect(res.missing_diagram).toBeUndefined();
  });
  it("fails closed (missing_diagram, not approved) when required but content is unreadable", async () => {
    // Register the doc + approval but delete the file so content can't be read.
    await approvedDocOnDisk("x", "plan", WITHOUT);
    await setRequireDiagram("plan", true);
    await fs.rm(path.join(project, "docs/x-plan.md"));
    const res = await getApprovalStatus(vaultPath, "x", "plan");
    expect(res.status).not.toBe("approved");
    expect(res.missing_diagram).toBe(true);
  });
});

describe("isClearedForCode transitively reflects the diagram block", () => {
  it("standard feature: plan approved but no required diagram ⇒ not cleared; with diagram ⇒ cleared", async () => {
    await approvedDocOnDisk("x", "plan", WITHOUT);
    await setRequireDiagram("plan", true);
    expect((await isClearedForCode(vaultPath, "x")).cleared).toBe(false);
    await fs.writeFile(path.join(project, "docs/x-plan.md"), WITH);
    // re-approve with the new content hash (content changed ⇒ prior approval is stale otherwise)
    const hash = hashContent(Buffer.from(WITH));
    const rec = JSON.parse(await fs.readFile(path.join(vaultPath, "approvals", "x.plan.json"), "utf-8"));
    rec.reviewers["r@o.c"].content_hash = hash;
    rec.history[rec.history.length - 1].content_hash = hash;
    await fs.writeFile(path.join(vaultPath, "approvals", "x.plan.json"), JSON.stringify(rec));
    expect((await isClearedForCode(vaultPath, "x")).cleared).toBe(true);
  });
});

describe("new vault default require_diagram", () => {
  it("VaultManager.create seeds spec.require_diagram=true, plan/adr off", async () => {
    const wf = await readWorkflows(vaultPath); // vault created in beforeEach
    expect(wf.spec.require_diagram).toBe(true);
    expect(wf.plan.require_diagram ?? false).toBe(false);
    expect(wf.adr.require_diagram ?? false).toBe(false);
  });
});
