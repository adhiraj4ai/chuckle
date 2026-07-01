import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  VaultManager,
  writeApproval,
  appendHistory,
  readApproval,
  hashContent,
  readWorkflows,
  writeWorkflows,
} from "@signoff/vault-core";
import { handleCheck } from "../src/tools/check.js";

let tmpDir: string;
let vaultPath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-mcp-check-"));
  // vaultPath is <tmp>/project/.signoff so project root is <tmp>/project/
  vaultPath = path.join(tmpDir, "project", ".signoff");
  process.env.SIGNOFF_HOME = path.join(tmpDir, ".signoff");
  await VaultManager.create(vaultPath, "test-project", "test-org");
  // Disable spec diagram requirement so pre-diagram-gating tests can approve specs normally.
  const wf = await readWorkflows(vaultPath);
  wf.spec = { ...wf.spec, require_diagram: false };
  await writeWorkflows(vaultPath, wf);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env.SIGNOFF_HOME;
});

describe("handleCheck", () => {
  it("returns not_found when no approval record exists", async () => {
    const result = await handleCheck(vaultPath, {
      feature_name: "user-auth",
      document_type: "spec",
    });
    expect(result.status).toBe("not_found");
  });

  it("returns pending after a document is submitted", async () => {
    const projectRoot = path.dirname(vaultPath);
    await fs.writeFile(path.join(projectRoot, "spec.md"), "# Spec\n");
    const vault = await VaultManager.open(vaultPath);
    await vault.submitForReview("user-auth", "spec", "spec.md", "dev@org.com", "Dev");

    const result = await handleCheck(vaultPath, {
      feature_name: "user-auth",
      document_type: "spec",
    });
    expect(result.status).toBe("pending");
  });

  it("returns approved with approved_by and approved_at after approval", async () => {
    const projectRoot = path.dirname(vaultPath);
    const docContent = "# Spec\n";
    const docPath = path.join(projectRoot, "spec.md");
    await fs.writeFile(docPath, docContent);
    const vault = await VaultManager.open(vaultPath);
    await vault.submitForReview("user-auth", "spec", "spec.md", "dev@org.com", "Dev");

    // Drive approval through the reviewers map so deriveStatus resolves to "approved".
    // Include the doc's content_hash so the approval is not treated as stale.
    const record = (await readApproval(vaultPath, "user-auth", "spec"))!;
    const contentHash = hashContent(await fs.readFile(docPath));
    const approved = {
      ...record,
      status: "approved" as const,
      reviewers: { "arch@org.com": { status: "approved" as const, at: "2026-06-27T14:00:00Z", content_hash: contentHash } },
      history: [...record.history, { action: "approved" as const, by: "arch@org.com", at: "2026-06-27T14:00:00Z", message: "LGTM", content_hash: contentHash }],
    };
    await writeApproval(vaultPath, approved);

    const result = await handleCheck(vaultPath, {
      feature_name: "user-auth",
      document_type: "spec",
    });
    expect(result.status).toBe("approved");
    expect(result.approved_by).toBe("arch@org.com");
    expect(result.approved_at).toBe("2026-06-27T14:00:00Z");
    expect(result.stale).toBe(false);
  });

  it("reports in_review when the document has changed since approval (stale approval)", async () => {
    const projectRoot = path.dirname(vaultPath);
    const docPath = path.join(projectRoot, "spec.md");
    const originalContent = "# Spec\n";
    await fs.writeFile(docPath, originalContent);
    const vault = await VaultManager.open(vaultPath);
    await vault.submitForReview("user-auth", "spec", "spec.md", "dev@org.com", "Dev");

    // Drive approval through the reviewers map with the original content hash.
    // When the doc later changes, deriveStatus will see the new hash doesn't match
    // the reviewer's content_hash, so approvedFresh() → false → status becomes in_review.
    const submitted = (await readApproval(vaultPath, "user-auth", "spec"))!;
    const originalHash = hashContent(await fs.readFile(docPath));
    const approved = {
      ...submitted,
      status: "approved" as const,
      reviewers: { "arch@org.com": { status: "approved" as const, at: "2026-06-27T14:00:00Z", content_hash: originalHash } },
      history: [...submitted.history, { action: "approved" as const, by: "arch@org.com", at: "2026-06-27T14:00:00Z", message: "LGTM", content_hash: originalHash }],
    };
    await writeApproval(vaultPath, approved);

    // Now change the doc — the reviewer's approval is now for a stale hash
    await fs.writeFile(docPath, "# Spec CHANGED\n");

    const result = await handleCheck(vaultPath, {
      feature_name: "user-auth",
      document_type: "spec",
    });
    // With the per-reviewer model, a stale approval (hash mismatch) derives to in_review,
    // not approved, because approvedFresh() returns false.
    expect(result.status).toBe("in_review");
  });

  it("reports stale: true when a remote is configured but the pull fails", async () => {
    const projectRoot = path.dirname(vaultPath);
    await fs.writeFile(path.join(projectRoot, "spec.md"), "# Spec\n");
    const vault = await VaultManager.open(vaultPath);
    await vault.submitForReview("user-auth", "spec", "spec.md", "dev@org.com", "Dev");

    // Add a remote that points nowhere reachable so `git pull --rebase` fails.
    // hasRemote() is then true, so freshness cannot be confirmed → stale: true.
    const { simpleGit } = await import("simple-git");
    await simpleGit(vaultPath).addRemote("origin", path.join(tmpDir, "does-not-exist.git"));

    const result = await handleCheck(vaultPath, {
      feature_name: "user-auth",
      document_type: "spec",
    });
    expect(result.stale).toBe(true);
  });

  it("throws if document_type is invalid", async () => {
    await expect(
      handleCheck(vaultPath, { feature_name: "user-auth", document_type: "brief" })
    ).rejects.toThrow(/document_type/);
  });
});
