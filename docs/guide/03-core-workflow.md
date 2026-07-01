# 3. The core workflow

This chapter describes the spec → plan → implement loop that SignOff enforces, how the gate blocks code edits, and what you see at each stage.

## Overview

Every feature in a SignOff-enabled project moves through three stages before code can be written:

1. **Spec** — describe what to build; publish for review; stop.
2. **Plan** — describe how to build it; publish for review; stop.
3. **Implement** — the gate opens; code edits are allowed.

Claude Code drives this loop. You (the developer) prompt the agent to start work on a feature. The agent writes documents, publishes them, and stops. You hand off to the reviewer. The reviewer approves in the SignOff desktop app. You come back to Claude Code and continue. The gate enforces each transition — it does not require you to remember the order yourself.

The default tier is `standard`, which gates code on **plan** approval (spec must precede plan). See [Feature tiers](06-feature-tiers.md) for `light` and `heavy` tiers.

## Stage 1: the spec

When you ask Claude Code to build a new feature, the agent writes a spec document to the project's docs root (default `docs/`) and publishes it:

```
Tool call: publish_document
  feature_name:    "user-auth"
  document_type:   "spec"
  document_path:   "docs/2026-07-01-user-auth-design.md"
```

After calling `publish_document`, the agent tells you the spec is submitted and **stops**. It does not start writing a plan or any code.

> Note: The feature name (`user-auth`) is inferred from the filename (`2026-07-01-user-auth-design.md` → `user-auth`). Use the same slug across all documents and tool calls for this feature.

At this point:

- The document is in the vault, under `docs/` (SignOff indexes its path; it does not copy the file).
- An approval record is created at `.signoff/approvals/user-auth.spec.json` with status `pending`.
- The SignOff desktop app shows a **New** indicator on the feature in the sidebar.

The reviewer opens the app, reads the spec, and either **Approves** or clicks **Request changes**. When they approve, the change is committed to the vault under their git identity.

## Stage 2: the plan

When you prompt Claude Code again (after the reviewer approves), the agent first calls `check_approval` to confirm the spec is approved:

```
Tool call: check_approval
  feature_name:   "user-auth"
  document_type:  "spec"

Response:
  status:          "approved"
  stale:           false
  missing_diagram: false
```

Because the spec is approved, the agent writes the plan document and publishes it:

```
Tool call: publish_document
  feature_name:   "user-auth"
  document_type:  "plan"
  document_path:  "docs/2026-07-01-user-auth-plan.md"
```

The agent tells you the plan is submitted and **stops** again. It does not start implementing.

If `check_approval` returns a status other than `approved` (for example, `in_review` or `rejected`), the agent reports the status and stops. It does not write the plan until the spec is approved.

## Stage 3: implement

After the reviewer approves the plan, you prompt Claude Code one more time. The agent calls `check_approval` on the plan:

```
Tool call: check_approval
  feature_name:   "user-auth"
  document_type:  "plan"

Response:
  status:          "approved"
  stale:           false
  missing_diagram: false
```

With the plan approved, the gate opens. The agent is now allowed to make code edits. Implementation proceeds normally.

## A complete sequence

```
Developer                Claude Code                    SignOff vault         Reviewer
────────                 ───────────                    ─────────────         ────────

"Build user-auth"  ──▶  writes spec.md
                         publish_document(               vault registers
                           "user-auth", "spec",          spec; status =
                           "docs/…-design.md")   ──────▶ pending
                         "Spec submitted" → STOP

                                                                         reads spec.md
                                                                         approves ──▶ commit
                                                         status =
                                                         approved

"Continue"         ──▶  check_approval("user-auth", "spec")
                         → approved
                         writes plan.md
                         publish_document(               vault registers
                           "user-auth", "plan",          plan; status =
                           "docs/…-plan.md")     ──────▶ pending
                         "Plan submitted" → STOP

                                                                         reads plan.md
                                                                         approves ──▶ commit
                                                         status =
                                                         approved

"Continue"         ──▶  check_approval("user-auth", "plan")
                         → approved
                         [gate opens]
                         implements feature
```

## The gate blocking behavior

The gate (`signoff-gate`, the `@signoff/superpowers-hook` PreToolUse hook) intercepts every tool call that would write or modify a file outside the doc-authoring area. If the feature's gating document is not approved, the hook returns an error and the edit is cancelled.

**What you see when blocked:** Claude Code reports that the edit was blocked by the SignOff gate, and tells you which feature and document type need approval. The agent does not retry the edit.

**The gate is fail-closed.** If the approval status is `pending`, `in_review`, `rejected`, or `not_found`, the gate blocks. A short sync delay between the reviewer's approval commit and your local vault can cause a brief `pending` window — run a Sync in the desktop app or pull the vault remote, then try again.

**Never bypass the gate with raw file writes.** If the agent uses a Bash command to write a file that the hook would have blocked, the gate is defeated. This is the behavior the gate is specifically designed to prevent. The agent should always call `publish_document` and stop, not work around the block.

## Approval status values

`check_approval` returns one of these status values:

| Status | Meaning |
|---|---|
| `pending` | Published; no review started yet. |
| `in_review` | A reviewer has started a review but not yet approved or rejected. |
| `approved` | All required approvers have approved; gate opens. |
| `rejected` | A reviewer requested changes. The document needs to be revised and re-published. |
| `not_found` | No document of this type has been published for this feature yet. |

The `stale` flag is `true` when the document file has changed since the last publish — meaning approval may no longer cover the current content.

The `missing_diagram` flag is `true` when the workflow requires a diagram (`require_diagram: true` in `workflows.json`) and the document does not contain one. A missing diagram does not block publishing, but it prevents approval in the reviewer's UI — the **Approve** button is disabled until a diagram is present. If you see `missing_diagram: true` from `check_approval`, add a fenced ` ```mermaid ` block or an embedded image to the document and re-publish.

## ADRs: non-blocking records

When the agent makes a non-obvious design decision during spec or plan work, it records an Architecture Decision Record:

```
Tool call: publish_document
  feature_name:   "user-auth"
  document_type:  "adr"
  document_path:  "docs/adr/user-auth-adr.md"
```

ADRs are non-blocking. A pending or absent ADR never stops the gate. The agent publishes the ADR in parallel with the normal spec → plan → implement flow without stopping.

When a new decision is made later, the agent edits the same ADR document (one per feature, with each decision as a dated `## <decision>` section) and re-publishes. Re-publishing re-opens the approval so reviewers see the document changed.

> Note: `check_approval` currently accepts `spec` and `plan` only — it does not accept `adr` as a document type. `publish_document` accepts all three types.

## Tickets

If a feature traces to an external tracker item, pass the ticket when publishing:

```
Tool call: publish_document
  feature_name:   "user-auth"
  document_type:  "spec"
  document_path:  "docs/…-design.md"
  ticket_id:      "PROJ-123"
  ticket_url:     "https://tracker.example.com/PROJ-123"
```

The ticket link appears in the FeatureMetaBar as a chip (`PROJ-123 ↗`) that opens the URL. The reviewer can add or change the ticket in the desktop app. Ticket information is never blocking.

## Listing pending documents

To see all documents currently awaiting review in the vault:

```
Tool call: list_pending
```

This is useful when you return to a project after a break, or when the reviewer wants to see their queue without opening the desktop app.

## See also

- [Introduction](01-introduction.md)
- [Getting started](02-getting-started.md)
