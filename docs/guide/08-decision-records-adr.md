# 8. Decision records (ADR)

An ADR (architecture decision record) is a first-class document type in SignOff: it has its own workflow, approval status, and review UI, but it **never blocks code**. Its purpose is to record the *why* behind non-obvious design choices, not to gate implementation.

---

## What an ADR is

Each feature has at most one ADR document — a single markdown file that accumulates dated decision sections over time. When you or Claude Code face a real design choice (a library, a data model, a significant tradeoff), the decision and its rationale get added to this file. The file grows as the feature evolves.

ADR approval is independent of spec and plan approval. Reviewers can approve, comment on, or request changes to an ADR without affecting whether code can proceed.

---

## How ADRs are produced

The SignOff workflow skill in Claude Code writes and maintains the ADR automatically during spec and plan work. When Claude Code makes a non-obvious design decision, it:

1. Writes or appends `docs/adr/<feature>-adr.md` in the project (one file per feature, each decision as a dated `## <decision>` section).
2. Calls `publish_document(feature_name, "adr", document_path)` to push the ADR into the vault and submit it for review.
3. On a later decision in the same feature, edits the same ADR file and calls `publish_document` again — re-publishing re-opens approval so reviewers can see what changed.

You can also write and publish an ADR manually using the same call:

```
publish_document(
  feature_name="user-auth",
  document_type="adr",
  document_path="docs/adr/user-auth-adr.md"
)
```

---

## ADR file structure

A typical ADR file for a feature looks like:

```markdown
# user-auth — Architecture decisions

## 2026-06-27: Use JWT for session tokens

**Decision:** Issue short-lived JWTs rather than server-side sessions.

**Alternatives considered:**
- Server-side sessions with Redis
- Opaque bearer tokens in the database

**Rationale:** The service is stateless; JWTs avoid a distributed session store.

---

## 2026-06-30: PKCE for the OAuth flow

**Decision:** Require PKCE on all OAuth authorization requests.

**Rationale:** PKCE mitigates authorization code interception without client secrets.
```

There is no fixed schema for the body of each section — the format is up to the team. What matters is that it exists in the vault and is submitted for review.

---

## How to review an ADR

In the SignOff desktop app:

1. Open the feature in the sidebar.
2. Click the **ADR** tab in the document pane (shown when an ADR has been published for the feature).
3. Use the review panel: **Start review**, then **Approve** or **Request changes** (with an optional note).

ADR approvers are configured separately from spec and plan approvers. In **Reviewer settings**, the **ADR** section has its own approvers list, approval rule (all listed / at least N), and diagram requirement.

---

## Why ADRs do not block code

The gate (`signoff-gate`) checks only the gating artifact for the feature's tier — either the spec (light) or the plan (standard/heavy). It never checks ADR status. This is intentional: the ADR captures reasoning that reviewers should see, but an incomplete or unapproved ADR should not halt development. The spec and plan already establish that the work itself is sound.

An ADR with no approvals, a pending ADR, or a missing ADR all result in the same gate behavior: code proceeds if the gating artifact is approved.

---

## Known limitation: `check_approval` does not accept `adr`

The `check_approval` MCP tool currently only accepts `spec` or `plan` as `document_type`. Passing `"adr"` returns an error.

To check ADR approval status, use the SignOff desktop app: open the feature, go to the ADR tab, and read the status pill in the review panel.

`publish_document` and `submit_for_review` both accept `"adr"` without restriction.

---

## Summary of ADR behavior

| Behavior | ADR |
|---|---|
| Gates code | No |
| Has approval workflow | Yes |
| Reviewable in desktop app | Yes |
| Configurable approvers | Yes |
| `check_approval` via MCP | No (known limitation) |
| `publish_document` via MCP | Yes |
| One file per feature | Yes |
| Re-publish re-opens approval | Yes |
| `require_diagram` default | `false` |

---

## See also

- [Feature tiers](06-feature-tiers.md) — which artifact actually gates code
- [Diagram gating](07-diagram-gating.md) — `require_diagram` applies to ADR too (off by default)
- [Approval policy](05-approval-policy.md) — `approval_mode`, `min_approvals`, `required_approvers`
