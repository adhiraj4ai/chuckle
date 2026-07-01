import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import {
  VaultManager,
  readWorkflows,
  writeWorkflows,
  readManifest,
  writeManifest,
  setFeatureDoc,
  writeApproval,
} from "@signoff/vault-core";
import { handleCheck } from "../src/tools/check.js";

let project: string, vaultPath: string;

beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-mcp-diag-"));
  vaultPath = path.join(project, ".signoff");
  await VaultManager.create(vaultPath, "proj");
  await fs.mkdir(path.join(project, "docs"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(project, { recursive: true, force: true });
});

describe("handleCheck with require_diagram", () => {
  it("check_approval reports missing_diagram when the workflow requires one and the doc has none", async () => {
    const rel = "docs/x-plan.md";
    const content = "# Plan\n\nno diagram\n";
    await fs.writeFile(path.join(project, rel), content);
    await writeManifest(
      vaultPath,
      setFeatureDoc(await readManifest(vaultPath), "x", "plan", rel)
    );

    // Write an approved record without content_hash (fail-closed path).
    // The doc will be deleted before handleCheck is called, so currentHash will be null.
    await writeApproval(vaultPath, {
      document: rel,
      feature: "x",
      type: "plan",
      workflow: "plan",
      status: "approved",
      reviewers: {
        "r@o.c": { status: "approved", at: "2026-07-01T00:00:00.000Z" },
      },
      history: [
        {
          action: "approved",
          by: "r@o.c",
          at: "2026-07-01T00:00:00.000Z",
          message: null,
        },
      ],
    });

    // Turn on require_diagram for the plan workflow
    const wf = await readWorkflows(vaultPath);
    wf.plan = { ...wf.plan, require_diagram: true };
    await writeWorkflows(vaultPath, wf);

    // Delete the doc file to trigger fail-closed: currentHash will be null,
    // and with require_diagram enabled, getApprovalStatus returns missing_diagram: true
    await fs.rm(path.join(project, rel));

    const res = await handleCheck(vaultPath, {
      feature_name: "x",
      document_type: "plan",
    });

    expect(res.status).not.toBe("approved");
    expect(res.missing_diagram).toBe(true);
  });
});
