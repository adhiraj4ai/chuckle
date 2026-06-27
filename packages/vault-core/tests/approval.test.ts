import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  approvalFilePath,
  readApproval,
  writeApproval,
  appendHistory,
  getApprovalStatus,
} from "../src/approval.js";
import { applyReviewerAction } from "../src/review.js";
import type { ApprovalRecord } from "../src/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "chuckle-approval-"));
  await fs.mkdir(path.join(tmpDir, "approvals"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const baseRecord: ApprovalRecord = {
  document: "spec.md",
  feature: "user-auth",
  type: "spec",
  workflow: "spec",
  status: "pending",
  reviewers: {},
  history: [
    { action: "submitted", by: "dev@org.com", at: "2026-06-27T10:00:00Z", message: null },
  ],
};

describe("approvalFilePath", () => {
  it("returns correct path for spec", () => {
    const p = approvalFilePath(tmpDir, "user-auth", "spec");
    expect(p).toBe(path.join(tmpDir, "approvals", "user-auth.spec.json"));
  });

  it("returns correct path for plan", () => {
    const p = approvalFilePath(tmpDir, "user-auth", "plan");
    expect(p).toBe(path.join(tmpDir, "approvals", "user-auth.plan.json"));
  });
});

describe("readApproval", () => {
  it("returns null when approval file does not exist", async () => {
    const result = await readApproval(tmpDir, "user-auth", "spec");
    expect(result).toBeNull();
  });

  it("reads existing approval file", async () => {
    await fs.writeFile(
      path.join(tmpDir, "approvals", "user-auth.spec.json"),
      JSON.stringify(baseRecord)
    );
    const result = await readApproval(tmpDir, "user-auth", "spec");
    expect(result?.status).toBe("pending");
    expect(result?.history).toHaveLength(1);
  });
});

describe("writeApproval", () => {
  it("writes approval record as pretty-printed JSON", async () => {
    await writeApproval(tmpDir, baseRecord);
    const raw = await fs.readFile(
      path.join(tmpDir, "approvals", "user-auth.spec.json"),
      "utf-8"
    );
    const parsed = JSON.parse(raw);
    expect(parsed.status).toBe("pending");
  });
});

describe("appendHistory", () => {
  it("appends entry without mutating original", () => {
    const entry = { action: "approved" as const, by: "arch@org.com", at: "2026-06-27T12:00:00Z", message: "LGTM" };
    const updated = appendHistory(baseRecord, entry);
    expect(updated.history).toHaveLength(2);
    expect(baseRecord.history).toHaveLength(1); // original unchanged
    expect(updated.status).toBe("approved");
  });

  it("sets status to rejected on requested_changes action", () => {
    const entry = { action: "requested_changes" as const, by: "arch@org.com", at: "2026-06-27T12:00:00Z", message: "Needs work" };
    const updated = appendHistory(baseRecord, entry);
    expect(updated.status).toBe("rejected");
  });

  it("sets status to pending on resubmitted action", () => {
    const entry = { action: "resubmitted" as const, by: "dev@org.com", at: "2026-06-27T13:00:00Z", message: null };
    const updated = appendHistory(baseRecord, entry);
    expect(updated.status).toBe("pending");
  });
});

describe("getApprovalStatus", () => {
  it("returns not_found when no approval file exists", async () => {
    const result = await getApprovalStatus(tmpDir, "user-auth", "spec");
    expect(result.status).toBe("not_found");
  });

  it("returns approved status with approver details when a reviewer has approved", async () => {
    // Drive the reviewers map: start_review then approve (no required_approvers in this
    // bare-tmpDir setup, so any approver in the map derives "approved").
    let rec = applyReviewerAction(baseRecord, "arch@org.com", "start_review", "2026-06-27T11:00:00Z");
    rec = applyReviewerAction(rec, "arch@org.com", "approve", "2026-06-27T12:00:00Z", "hash-abc");
    await writeApproval(tmpDir, rec);
    const result = await getApprovalStatus(tmpDir, "user-auth", "spec");
    expect(result.status).toBe("approved");
    expect(result.approved_by).toBe("arch@org.com");
    expect(result.approved_at).toBe("2026-06-27T12:00:00Z");
  });
});
