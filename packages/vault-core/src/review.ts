import type { ApprovalRecord, ApprovalStatus, ReviewerStatus, ApprovalAction, ApprovalMode } from "./types.js";

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
  contentHash?: string,
  message?: string | null
): ApprovalRecord {
  const reviewers = record.reviewers ?? {};
  const current = reviewers[email]?.status ?? "pending";
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
    reviewers: { ...reviewers, [email]: state },
    history: [...(record.history ?? []), { action: HISTORY_ACTION[action], by: email, at: now, message: message ?? null, content_hash: contentHash }],
  };
}

/**
 * Roll the per-reviewer statuses up to a single document status.
 *
 * `requiredApprovers` is the configured required-approver set, or `null` when
 * that set is UNKNOWN (e.g. the workflow config could not be read/parsed). When
 * the required set is unknown we MUST fail closed: never return "approved",
 * because we cannot prove the policy was satisfied. This is the security gate —
 * a missing/corrupt workflows.json must not downgrade to "any reviewer wins".
 */
export function deriveStatus(
  record: ApprovalRecord,
  requiredApprovers: string[] | null,
  currentHash: string | null,
  options?: { mode?: ApprovalMode; minApprovals?: number }
): ApprovalStatus {
  const reviewers = record.reviewers ?? {};
  const entries = Object.entries(reviewers);
  const approvedFresh = (s: { status: ReviewerStatus; content_hash?: string }) =>
    s.status === "approved" && (!currentHash || s.content_hash === currentHash);

  // changes requested by any required reviewer wins
  if (requiredApprovers !== null && requiredApprovers.some((e) => reviewers[e]?.status === "changes_requested")) {
    return "rejected";
  }

  if (requiredApprovers === null) {
    // Required set unknown — fail closed. The doc can never be "approved" here;
    // at most reflect that review is underway.
  } else if (requiredApprovers.length > 0) {
    if (options?.mode === "threshold") {
      const min = Math.min(
        requiredApprovers.length,
        Math.max(1, Math.floor(options.minApprovals ?? 1) || 1)
      );
      const freshCount = requiredApprovers.filter((e) => reviewers[e] && approvedFresh(reviewers[e])).length;
      if (freshCount >= min) return "approved";
    } else if (requiredApprovers.every((e) => reviewers[e] && approvedFresh(reviewers[e]))) {
      return "approved";
    }
  } else if (entries.some(([, s]) => approvedFresh(s))) {
    return "approved";
  }

  if (entries.some(([, s]) => s.status === "in_review" || s.status === "approved" || s.status === "changes_requested")) {
    return "in_review";
  }
  return "pending";
}
