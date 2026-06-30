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
  readManifest,
  writeManifest,
  setFeatureTier,
} from "@signoff/vault-core";
import { runCheck } from "../src/check.js";

let project: string;
beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-ci-"));
});
afterEach(async () => {
  await fs.rm(project, { recursive: true, force: true });
});

async function approveArtifact(type: "spec" | "plan"): Promise<void> {
  const vaultPath = path.join(project, ".signoff");
  await VaultManager.create(vaultPath, "proj");
  await fs.mkdir(path.join(project, "docs"), { recursive: true });
  await fs.writeFile(path.join(project, "docs", `x-${type}.md`), `# ${type}`);
  const v = await VaultManager.open(vaultPath);
  await v.submitForReview("x", type, `docs/x-${type}.md`, "a@o.c", "A");
  const hash = hashContent(await fs.readFile(path.join(project, "docs", `x-${type}.md`)));
  let rec = await readApproval(vaultPath, "x", type);
  rec = applyReviewerAction(rec!, "a@o.c", "start_review", "2026-06-30T00:00:00Z", hash, null);
  rec = applyReviewerAction(rec, "a@o.c", "approve", "2026-06-30T00:01:00Z", hash, null);
  await writeApproval(vaultPath, rec);
}

describe("runCheck", () => {
  it("ok for a light feature once its spec is approved", async () => {
    await approveArtifact("spec");
    const vaultPath = path.join(project, ".signoff");
    let m = await readManifest(vaultPath);
    m = setFeatureTier(m, "x", "light");
    await writeManifest(vaultPath, m);
    const r = await runCheck({ projectRoot: project, feature: "x" });
    expect(r.ok).toBe(true);
    expect(r.tier).toBe("light");
    expect(r.artifact).toBe("spec");
    expect(r.status).toBe("approved");
  });

  it("not ok for a standard feature with only the spec approved", async () => {
    await approveArtifact("spec");
    // standard tier (default) requires plan — spec alone is not enough
    const r = await runCheck({ projectRoot: project, feature: "x" });
    expect(r.ok).toBe(false);
    expect(r.tier).toBe("standard");
    expect(r.artifact).toBe("plan");
  });

  it("ok for a standard feature once its plan is approved", async () => {
    await approveArtifact("plan");
    const r = await runCheck({ projectRoot: project, feature: "x" });
    expect(r.ok).toBe(true);
    expect(r.tier).toBe("standard");
    expect(r.artifact).toBe("plan");
    expect(r.status).toBe("approved");
  });

  it("not ok / not_found when no artifact registered", async () => {
    const vaultPath = path.join(project, ".signoff");
    await VaultManager.create(vaultPath, "proj");
    const r = await runCheck({ projectRoot: project, feature: "ghost" });
    expect(r.ok).toBe(false);
    expect(r.status).toBe("not_found");
  });

  it("fails closed (no throw) when the vault is missing", async () => {
    const r = await runCheck({ projectRoot: project, feature: "x" });
    expect(r.ok).toBe(false);
  });
});
