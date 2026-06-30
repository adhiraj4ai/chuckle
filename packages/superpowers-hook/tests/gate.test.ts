import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  VaultManager,
  writeActiveFeature,
  readApproval,
  writeApproval,
  readManifest,
  writeManifest,
  setFeatureDoc,
  setFeatureTier,
} from "@signoff/vault-core";
import type { ApprovalRecord } from "@signoff/vault-core";
import { evaluateGate } from "../src/gate.js";

let tmpDir: string;
let projectRoot: string;
let vaultPath: string;

/**
 * Registers a doc in the manifest (writeManifest + setFeatureDoc) and creates
 * a pending approval record for it, without going through git / VaultManager.publish.
 */
async function registerDoc(feature: string, type: "spec" | "plan", rel: string): Promise<void> {
  const m = setFeatureDoc(await readManifest(vaultPath), feature, type, rel);
  await writeManifest(vaultPath, m);
  const record: ApprovalRecord = {
    document: rel,
    feature,
    type,
    workflow: type,
    status: "pending",
    reviewers: {},
    history: [{ action: "submitted", by: "dev@org.com", at: new Date().toISOString(), message: null }],
  };
  await writeApproval(vaultPath, record);
}

/** Flips an existing approval record to "approved" via the reviewers map. */
async function approve(feature: string, type: "spec" | "plan"): Promise<void> {
  const record = await readApproval(vaultPath, feature, type);
  if (!record) throw new Error(`no record to approve for ${feature}/${type}`);
  const now = new Date().toISOString();
  // Drive approval through the per-reviewer map so deriveStatus resolves to "approved".
  // required_approvers is empty (default workflows), so any approved reviewer suffices.
  // No currentHash (doc not written to disk here), so approvedFresh passes without content_hash.
  const updated: ApprovalRecord = {
    ...record,
    status: "approved",
    reviewers: { "reviewer@org.com": { status: "approved", at: now } },
    history: [...record.history, { action: "approved", by: "reviewer@org.com", at: now, message: null }],
  };
  await writeApproval(vaultPath, updated);
}

function writeEvent(rel: string): { cwd: string; tool_name: string; tool_input: { file_path: string } } {
  return { cwd: projectRoot, tool_name: "Write", tool_input: { file_path: path.join(projectRoot, rel) } };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-gate-test-"));
  projectRoot = path.join(tmpDir, "project");
  vaultPath = path.join(projectRoot, ".signoff");
  process.env.SIGNOFF_HOME = path.join(tmpDir, ".signoff-home");
  await fs.mkdir(projectRoot, { recursive: true });
  // Vault lives at projectRoot/.signoff — matches gate's SIGNOFF_DIR constant.
  await VaultManager.create(vaultPath, "test-project");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env.SIGNOFF_HOME;
});

describe("evaluateGate", () => {
  // --- .signoff dir always allowed -----------------------------------------

  it("allows writes to the .signoff vault dir", async () => {
    const decision = await evaluateGate(writeEvent(".signoff/active-feature.json"));
    expect(decision.allow).toBe(true);
  });

  // --- Spec authoring (entry point) ----------------------------------------

  it("allows authoring a spec under a doc root (docs/specs)", async () => {
    // "docs" is a default doc_root; a new spec-classified file under it is allowed.
    const decision = await evaluateGate(writeEvent("docs/specs/2026-06-27-foo-design.md"));
    expect(decision.allow).toBe(true);
  });

  it("allows authoring a spec under docs/ doc root", async () => {
    // "docs" is the only default doc_root; a new spec-classified file under it is allowed.
    const decision = await evaluateGate(writeEvent("docs/specs/2026-06-27-bar-design.md"));
    expect(decision.allow).toBe(true);
  });

  it("does not auto-allow a spec write under .superpowers/ when no active feature (not a doc root)", async () => {
    // .superpowers/ is no longer a default doc root — writes there fall through to the code gate.
    const decision = await evaluateGate(writeEvent(".superpowers/specs/2026-06-27-bar-design.md"));
    expect(decision.allow).toBe(false);
  });

  it("allows writes to a registered spec doc", async () => {
    await registerDoc("user-auth", "spec", "docs/specs/2026-06-27-user-auth-design.md");
    const decision = await evaluateGate(writeEvent("docs/specs/2026-06-27-user-auth-design.md"));
    expect(decision.allow).toBe(true);
  });

  // --- Registered plan doc: gate on spec approval --------------------------

  it("gates a registered plan doc on spec approval", async () => {
    await registerDoc("user-auth", "spec", "docs/specs/2026-06-27-user-auth-design.md");
    await registerDoc("user-auth", "plan", "docs/plans/2026-06-27-user-auth.md");
    const decision = await evaluateGate(writeEvent("docs/plans/2026-06-27-user-auth.md"));
    expect(decision.allow).toBe(false);
    expect(decision.reason).toMatch(/spec/i);
  });

  it("blocks the plan doc while the spec is only in_review", async () => {
    await registerDoc("user-auth", "spec", "docs/specs/2026-06-27-user-auth-design.md");
    await registerDoc("user-auth", "plan", "docs/plans/2026-06-27-user-auth.md");
    // set spec reviewer to in_review
    const rec = await readApproval(vaultPath, "user-auth", "spec");
    rec!.reviewers = { "r@o.c": { status: "in_review", at: "t" } };
    await writeApproval(vaultPath, rec!);
    const d = await evaluateGate(writeEvent("docs/plans/2026-06-27-user-auth.md"));
    expect(d.allow).toBe(false);
    expect(d.reason).toMatch(/spec/i);
  });

  it("allows the plan doc once the spec is approved", async () => {
    await registerDoc("user-auth", "spec", "docs/specs/2026-06-27-user-auth-design.md");
    await registerDoc("user-auth", "plan", "docs/plans/2026-06-27-user-auth.md");
    await approve("user-auth", "spec");
    const decision = await evaluateGate(writeEvent("docs/plans/2026-06-27-user-auth.md"));
    expect(decision.allow).toBe(true);
  });

  // --- New (unregistered) plan file under a doc root: allow authoring ------

  it("allows authoring a new plan file under a doc root", async () => {
    // Not registered in the manifest yet — allow authoring until it is submitted.
    const decision = await evaluateGate(writeEvent("docs/plans/2026-06-27-new-plan.md"));
    expect(decision.allow).toBe(true);
  });

  // --- Non-markdown under a doc root must NOT get the spec free pass --------

  it("does NOT auto-allow a non-.md file under a doc root (hits the code gate)", async () => {
    // docs/app.ts is under the "docs" doc root but is not a markdown spec/plan.
    // It must fall through to code-gating, not get a free authoring pass.
    const decision = await evaluateGate(writeEvent("docs/app.ts"));
    expect(decision.allow).toBe(false);
    expect(decision.reason).toMatch(/no active feature|submit a spec/i);
  });

  it("does NOT auto-allow a .json file under a doc root", async () => {
    const decision = await evaluateGate(writeEvent("docs/x.json"));
    expect(decision.allow).toBe(false);
  });

  it("still auto-allows a .md spec under a doc root", async () => {
    const decision = await evaluateGate(writeEvent("docs/specs/foo.md"));
    expect(decision.allow).toBe(true);
  });

  it("gates a non-.md file under a doc root on the active feature's plan approval", async () => {
    // With an approved plan + active feature, docs/app.ts is allowed via the code path.
    await registerDoc("user-auth", "plan", "docs/plans/2026-06-27-user-auth.md");
    await approve("user-auth", "plan");
    await writeActiveFeature(projectRoot, { feature: "user-auth", vaultPath });
    const decision = await evaluateGate(writeEvent("docs/app.ts"));
    expect(decision.allow).toBe(true);
  });

  // --- Code writes: require active-feature + plan approval -----------------

  it("blocks code writes when no active-feature pointer exists", async () => {
    const decision = await evaluateGate(writeEvent("src/index.ts"));
    expect(decision.allow).toBe(false);
    expect(decision.reason).toMatch(/no active feature|submit a spec/i);
  });

  it("blocks code writes when the plan is not approved", async () => {
    await registerDoc("user-auth", "plan", "docs/plans/2026-06-27-user-auth.md");
    await writeActiveFeature(projectRoot, { feature: "user-auth", vaultPath });
    const decision = await evaluateGate(writeEvent("src/index.ts"));
    expect(decision.allow).toBe(false);
    expect(decision.reason).toMatch(/plan/i);
  });

  it("allows code writes once the plan is approved", async () => {
    await registerDoc("user-auth", "plan", "docs/plans/2026-06-27-user-auth.md");
    await approve("user-auth", "plan");
    await writeActiveFeature(projectRoot, { feature: "user-auth", vaultPath });
    const decision = await evaluateGate(writeEvent("src/index.ts"));
    expect(decision.allow).toBe(true);
  });

  // --- Fail-closed ---------------------------------------------------------

  it("fails closed when the pointer references an unreadable vault", async () => {
    await writeActiveFeature(projectRoot, {
      feature: "ghost",
      vaultPath: path.join(tmpDir, "nope"),
    });
    const decision = await evaluateGate(writeEvent("src/index.ts"));
    expect(decision.allow).toBe(false);
  });

  // --- Tier-aware code gating ----------------------------------------------

  it("allows code for a light-tier feature once its spec is approved", async () => {
    // Set feature tier to light, register + approve its spec, set active-feature.
    await registerDoc("x", "spec", "docs/specs/2026-07-01-x-design.md");
    await approve("x", "spec");
    const m = setFeatureTier(await readManifest(vaultPath), "x", "light");
    await writeManifest(vaultPath, m);
    await writeActiveFeature(projectRoot, { feature: "x", vaultPath });
    const decision = await evaluateGate(writeEvent("src/app.ts"));
    expect(decision.allow).toBe(true);
  });

  it("blocks code for a standard-tier feature with only the spec approved", async () => {
    // Register + approve spec only; no plan; feature stays standard (default).
    await registerDoc("x", "spec", "docs/specs/2026-07-01-x-design.md");
    await approve("x", "spec");
    await writeActiveFeature(projectRoot, { feature: "x", vaultPath });
    const decision = await evaluateGate(writeEvent("src/app.ts"));
    expect(decision.allow).toBe(false);
    expect(decision.reason).toMatch(/plan/);
  });

  // --- No-target events are always allowed ---------------------------------

  it("allows tool calls with no file path target", async () => {
    const decision = await evaluateGate({ cwd: projectRoot, tool_name: "Write", tool_input: {} });
    expect(decision.allow).toBe(true);
  });

  // --- notebook_path and absolute file_path variants -----------------------

  it("blocks NotebookEdit events via notebook_path when no active feature exists", async () => {
    const decision = await evaluateGate({
      cwd: projectRoot,
      tool_name: "NotebookEdit",
      tool_input: { notebook_path: path.join(projectRoot, "src/analysis.ipynb") },
    });
    expect(decision.allow).toBe(false);
  });

  it("blocks MultiEdit events via file_path when no active feature exists", async () => {
    const decision = await evaluateGate({
      cwd: projectRoot,
      tool_name: "MultiEdit",
      tool_input: { file_path: path.join(projectRoot, "src/utils.ts") },
    });
    expect(decision.allow).toBe(false);
  });

  // --- Doc root boundary ---------------------------------------------------

  it("blocks writes outside doc roots when no active feature (not under docs)", async () => {
    // e.g. "src/README.md" is not under a doc root and not a registered doc
    const decision = await evaluateGate(writeEvent("src/README.md"));
    expect(decision.allow).toBe(false);
    expect(decision.reason).toMatch(/no active feature|submit a spec/i);
  });
});
