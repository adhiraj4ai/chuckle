# 4. Reviewing and approving

This chapter explains how to review and approve feature documents in the SignOff desktop app.

---

## Opening a vault

Launch the SignOff desktop app. On the project picker screen, select the vault you want to review. The vault lives at `<project>/.signoff` by default. Once open, the sidebar lists every feature that has been published for review.

---

## Finding features in the sidebar

The sidebar shows one row per feature. Each row gives you at a glance:

- **Status pills** — small letter badges on the right of each row show which document types exist and their status. `S` = Spec, `P` = Plan, `A` = ADR. Each pill is tinted by the document's current status (amber for in-review, green for approved, red for changes requested).
- **Tier badge** — features with a `light` or `heavy` tier show a small text badge. Standard-tier features show no badge.
- **Category swatch** — a colored dot marks the feature's category, if set.
- **Tag chips** — up to two tags are shown inline; `+N` indicates additional tags.
- **New indicator** — a small filled dot appears on features that arrived since you last opened the vault and have not yet been opened. Opening the feature dismisses it.

### Narrowing the list

Use the controls at the top of the sidebar to narrow down what you see:

- **Search** — type in the "Find a feature…" box to filter by feature name.
- **Status filters** — click **All**, **Pending**, **In review**, **Changes**, or **Approved** to show only features whose documents match that status. Each filter shows a live count.
- **Tag filters** — if tags are present, click any `#tag` chip to narrow to features carrying that tag. Multiple selections AND together.
- **Arrange by** — switch between **Feature** (alphabetical), **Status**, and **Category** groupings.

### Sync

Click **Sync** in the sidebar header to pull the latest documents from the vault's git remote. Approvals from other reviewers and newly published documents appear after a sync. There is a short delay while git pull and push complete.

---

## Opening a feature

Click a feature row to open it. The main area shows:

- **FeatureMetaBar** — a header bar with the feature's category, tier (light / standard / heavy), tags, and ticket chip (`PROJ-123 ↗`). You can edit these fields here without affecting the review.
- **Document tabs** — tabs appear for each document type that has been published: **Spec**, **Plan**, **ADR**. Click a tab to switch.
- **Document pane** — the selected document renders as formatted markdown, with Mermaid diagrams, syntax-highlighted code, and math (KaTeX) rendered inline.
- **Review panel** — a sidebar on the right showing the current status, reviewer list, and your available actions.

---

## The review panel

The review panel is where you take action on a document.

### Status pill

The top of the panel shows the document's current derived status:

| Status label | Meaning |
|---|---|
| Awaiting Approval | No reviewer has acted yet |
| In Review | At least one reviewer has started review |
| Approved | The approval policy has been satisfied |
| Changes Requested | A required reviewer has requested changes |
| Not Submitted | No approval record exists for this document |

Status is always **derived** — it is computed from the combined state of all reviewer decisions and the current document content. You cannot set it manually.

### Reviewer list

Below the status pill, the panel shows each required reviewer (or any reviewer who has acted, if no required list is configured) with their current decision and the date of their last action.

### Taking action

Your available actions depend on your current state for this document:

**1. Start review**

When your status is "Awaiting review", click **Start review**. This marks you as actively reviewing the document and unlocks the approve/request-changes actions.

**2. Approve or Request changes**

Once you have started review, two buttons appear:

- **Approve** — marks your decision as approved. If `require_diagram` is set for this document type and no diagram is present in the document, the Approve button is disabled. See the [diagram gating note](#diagram-required) below.
- **Request changes** — marks your decision as changes requested.

Both actions open a note composer: a short optional text area labeled "Add a note (optional)…". You can leave a note or submit without one. Click the action button again in the composer to confirm, or **Cancel** to go back.

**3. Reopen**

If you have already approved or requested changes and want to revise your decision, click **Reopen**. This moves you back to "In review" so you can act again.

### Discussion

Threaded comments on the document appear in the discussion rail alongside the review panel. Use discussion comments for questions or inline feedback that does not constitute a formal review decision.

---

## How status is derived

SignOff never stores a flat "approved/rejected" flag on a document. Status is always recalculated from the approval record each time it is read. This means:

- A document is **approved** only when the configured policy is satisfied (see [Approval policy](05-approval-policy.md)).
- If a required reviewer requests changes, the document moves to **Changes Requested** regardless of how many others have approved.
- If only non-required reviewers have acted (and a required list is configured), the document cannot reach **Approved**.

### Staleness

A document's approval is tied to its content at the time each reviewer approved it. If the document is updated after an approval — for example, the developer pushes a revised spec — the previous approval is **stale**: the reviewer's `approved` decision was recorded against an older content hash, so the document reverts to a non-approved status until reviewers re-approve the new version.

This means an "Approved" document does not stay approved through edits. Reviewers must re-approve any document that changes after their approval.

### Diagram required {#diagram-required}

If `require_diagram` is enabled for a document type (see [Approval policy](05-approval-policy.md)), the review panel shows a notice:

> ⚠ Diagram required — add a mermaid block or an image before this can be approved.

While this notice is shown, the **Approve** button is disabled. The developer must add a Mermaid diagram block (or an image) to the document and republish it before any reviewer can approve.

---

## How approvals are committed

Each review action — start review, approve, request changes, reopen — is committed to the vault's git repository under the **reviewer's own git identity** (name and email from their local git config). SignOff never uses a bot or placeholder author. The approval record is then pushed to the vault's remote so other reviewers and the gate can see the result.

Reviewers are identified by their **git email**. The email must match what is in the vault's `required_approvers` list (if one is configured) for the approval to count toward the policy.

---

## See also

- [Approval policy](05-approval-policy.md) — how to configure required approvers, modes, and diagram gating
- [GitHub enforcement](11-github-enforcement.md) — CI checks that gate PRs on approval status
