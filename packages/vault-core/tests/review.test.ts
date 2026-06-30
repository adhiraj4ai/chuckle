import { describe, it, expect } from "vitest";
import { applyReviewerAction, deriveStatus } from "../src/review.js";
import type { ApprovalRecord } from "../src/types.js";

function base(): ApprovalRecord {
  return {
    document: "docs/a.md", feature: "f", type: "spec", workflow: "spec",
    status: "pending", reviewers: {}, history: [],
  };
}

describe("applyReviewerAction", () => {
  it("start_review moves a reviewer to in_review", () => {
    const r = applyReviewerAction(base(), "a@o.c", "start_review", "t1");
    expect(r.reviewers["a@o.c"].status).toBe("in_review");
    expect(r.history.at(-1)).toMatchObject({ action: "started_review", by: "a@o.c", at: "t1" });
  });

  it("approve requires in_review first", () => {
    expect(() => applyReviewerAction(base(), "a@o.c", "approve", "t1")).toThrow(/in review/i);
  });

  it("approve from in_review records the content hash", () => {
    let r = applyReviewerAction(base(), "a@o.c", "start_review", "t1");
    r = applyReviewerAction(r, "a@o.c", "approve", "t2", "hash123");
    expect(r.reviewers["a@o.c"]).toMatchObject({ status: "approved", content_hash: "hash123" });
  });

  it("request_changes requires in_review and records the hash", () => {
    let r = applyReviewerAction(base(), "a@o.c", "start_review", "t1");
    r = applyReviewerAction(r, "a@o.c", "request_changes", "t2", "h");
    expect(r.reviewers["a@o.c"].status).toBe("changes_requested");
  });

  it("reopen returns an approved reviewer to in_review", () => {
    let r = applyReviewerAction(base(), "a@o.c", "start_review", "t1");
    r = applyReviewerAction(r, "a@o.c", "approve", "t2", "h");
    r = applyReviewerAction(r, "a@o.c", "reopen", "t3");
    expect(r.reviewers["a@o.c"].status).toBe("in_review");
  });

  it("start_review works on a legacy record with no reviewers map", () => {
    const legacy = { document: "d", feature: "f", type: "spec", workflow: "spec", status: "pending", history: [] } as unknown as ApprovalRecord;
    const r = applyReviewerAction(legacy, "a@o.c", "start_review", "t1");
    expect(r.reviewers["a@o.c"].status).toBe("in_review");
  });

  it("approve records the message on the history entry", () => {
    let r = applyReviewerAction(base(), "a@o.c", "start_review", "t1");
    r = applyReviewerAction(r, "a@o.c", "approve", "t2", "hash", "LGTM");
    expect(r.history.at(-1)?.message).toBe("LGTM");
  });

  it("start_review with no message leaves message: null", () => {
    const r = applyReviewerAction(base(), "a@o.c", "start_review", "t1");
    expect(r.history.at(-1)?.message).toBeNull();
  });
});

describe("deriveStatus", () => {
  function withReviewers(map: ApprovalRecord["reviewers"]): ApprovalRecord {
    return { ...base(), reviewers: map };
  }
  it("not all required approved -> in_review", () => {
    const r = withReviewers({ "a@o.c": { status: "approved", at: "t", content_hash: "h" }, "b@o.c": { status: "in_review", at: "t" } });
    expect(deriveStatus(r, ["a@o.c", "b@o.c"], "h")).toBe("in_review");
  });
  it("all required approved with matching hash -> approved", () => {
    const r = withReviewers({ "a@o.c": { status: "approved", at: "t", content_hash: "h" }, "b@o.c": { status: "approved", at: "t", content_hash: "h" } });
    expect(deriveStatus(r, ["a@o.c", "b@o.c"], "h")).toBe("approved");
  });
  it("any required changes_requested -> rejected (precedence)", () => {
    const r = withReviewers({ "a@o.c": { status: "approved", at: "t", content_hash: "h" }, "b@o.c": { status: "changes_requested", at: "t" } });
    expect(deriveStatus(r, ["a@o.c", "b@o.c"], "h")).toBe("rejected");
  });
  it("stale approval (hash mismatch) does not count -> in_review", () => {
    const r = withReviewers({ "a@o.c": { status: "approved", at: "t", content_hash: "OLD" } });
    expect(deriveStatus(r, ["a@o.c"], "NEW")).toBe("in_review");
  });
  it("empty required list, one approval with matching hash -> approved", () => {
    const r = withReviewers({ "x@o.c": { status: "approved", at: "t", content_hash: "h" } });
    expect(deriveStatus(r, [], "h")).toBe("approved");
  });
  it("no reviewers acted -> pending", () => {
    expect(deriveStatus(base(), ["a@o.c"], "h")).toBe("pending");
  });
  it("derives pending for a legacy record with no reviewers map", () => {
    const legacy = { document: "d", feature: "f", type: "spec", workflow: "spec", status: "pending", history: [] } as unknown as ApprovalRecord;
    expect(deriveStatus(legacy, ["a@o.c"], "h")).toBe("pending");
  });
});

function recWith(states: Record<string, "approved" | "changes_requested" | "in_review">, hash = "h"): ApprovalRecord {
  const reviewers: ApprovalRecord["reviewers"] = {};
  for (const [email, status] of Object.entries(states)) {
    reviewers[email] = { status, at: "2026-06-30T00:00:00Z", ...(status === "approved" && { content_hash: hash }) };
  }
  return {
    document: "specs/x.md", feature: "x", type: "spec", workflow: "spec",
    status: "pending", reviewers, history: [],
  } as ApprovalRecord;
}

describe("deriveStatus threshold mode", () => {
  const req = ["a@o.c", "b@o.c", "c@o.c"];
  const opt = (minApprovals: number) => ({ mode: "threshold" as const, minApprovals });

  it("approves at exactly min approvals (1 of 3)", () => {
    expect(deriveStatus(recWith({ "a@o.c": "approved" }), req, "h", opt(1))).toBe("approved");
  });

  it("does not approve below min (needs 2, has 1)", () => {
    expect(deriveStatus(recWith({ "a@o.c": "approved" }), req, "h", opt(2))).toBe("in_review");
  });

  it("approves once min is met (2 of 3)", () => {
    expect(deriveStatus(recWith({ "a@o.c": "approved", "b@o.c": "approved" }), req, "h", opt(2))).toBe("approved");
  });

  it("clamps min above the required count to unanimous-equivalent", () => {
    expect(deriveStatus(recWith({ "a@o.c": "approved", "b@o.c": "approved" }), req, "h", opt(9))).toBe("in_review");
    expect(deriveStatus(recWith({ "a@o.c": "approved", "b@o.c": "approved", "c@o.c": "approved" }), req, "h", opt(9))).toBe("approved");
  });

  it("clamps min<=0 / NaN up to 1", () => {
    expect(deriveStatus(recWith({ "a@o.c": "approved" }), req, "h", { mode: "threshold", minApprovals: 0 })).toBe("approved");
    expect(deriveStatus(recWith({ "a@o.c": "approved" }), req, "h", { mode: "threshold", minApprovals: NaN })).toBe("approved");
  });

  it("counts only FRESH approvals (stale approval does not count)", () => {
    const stale = recWith({ "a@o.c": "approved" }, "OLD");
    expect(deriveStatus(stale, req, "NEW", opt(1))).toBe("in_review");
  });

  it("changes_requested by a required reviewer still blocks in threshold mode", () => {
    expect(deriveStatus(recWith({ "a@o.c": "approved", "b@o.c": "changes_requested" }), req, "h", opt(1))).toBe("rejected");
  });

  it("omitting options reproduces unanimous (regression)", () => {
    expect(deriveStatus(recWith({ "a@o.c": "approved" }), req, "h")).toBe("in_review");
    expect(deriveStatus(recWith({ "a@o.c": "approved", "b@o.c": "approved", "c@o.c": "approved" }), req, "h")).toBe("approved");
  });

  it("empty required list + threshold falls through to any-one-approval", () => {
    expect(deriveStatus(recWith({ "z@o.c": "approved" }), [], "h", opt(5))).toBe("approved");
  });
});
