import type { ApprovalRecord, ApprovalStatus, ReviewerStatus, ApprovalAction } from "./types.js";

export type ReviewAction = "start_review" | "approve" | "request_changes" | "reopen";

const NEXT: Record<ReviewAction, ReviewerStatus> = {
  start_review: "in_review",
  approve: "approved",
  request_changes: "changes_requested",
  reopen: "in_review",
};

const HISTORY_ACTION: Record<ReviewAction, ApprovalAction> = {
  start_review: "started_review",
  approve: "approved",
  request_changes: "requested_changes",
  reopen: "reopened",
};

/** Apply a reviewer's action, returning a new record. Throws on illegal transitions. */
export function applyReviewerAction(
  record: ApprovalRecord,
  email: string,
  action: ReviewAction,
  now: string,
  contentHash?: string
): ApprovalRecord {
  const current = record.reviewers[email]?.status ?? "pending";
  if ((action === "approve" || action === "request_changes") && current !== "in_review") {
    throw new Error(`reviewer must be in review before "${action}" (current: ${current})`);
  }
  const state = {
    status: NEXT[action],
    at: now,
    ...(action === "approve" || action === "request_changes" ? { content_hash: contentHash } : {}),
  };
  return {
    ...record,
    reviewers: { ...record.reviewers, [email]: state },
    history: [...record.history, { action: HISTORY_ACTION[action], by: email, at: now, message: null, content_hash: contentHash }],
  };
}

/** Roll the per-reviewer statuses up to a single document status. */
export function deriveStatus(
  record: ApprovalRecord,
  requiredApprovers: string[],
  currentHash: string | null
): ApprovalStatus {
  const reviewers = record.reviewers ?? {};
  const entries = Object.entries(reviewers);
  const approvedFresh = (s: { status: ReviewerStatus; content_hash?: string }) =>
    s.status === "approved" && (!currentHash || s.content_hash === currentHash);

  // changes requested by any required reviewer wins
  if (requiredApprovers.some((e) => reviewers[e]?.status === "changes_requested")) return "rejected";

  if (requiredApprovers.length > 0) {
    if (requiredApprovers.every((e) => reviewers[e] && approvedFresh(reviewers[e]))) return "approved";
  } else if (entries.some(([, s]) => approvedFresh(s))) {
    return "approved";
  }

  if (entries.some(([, s]) => s.status === "in_review" || s.status === "approved" || s.status === "changes_requested")) {
    return "in_review";
  }
  return "pending";
}
