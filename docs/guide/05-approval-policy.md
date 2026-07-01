# 5. Approval policy

This chapter explains how to configure who must approve a document and under what conditions approval is granted.

---

## Overview

Every vault has a `workflows.json` file at `<project>/.signoff/workflows.json`. It defines the approval policy for each document type: who must approve, how many, and whether a diagram is required. The gate, CI check, and the desktop app all read this file to determine whether a document is approved.

SignOff is **fail-closed**: if `workflows.json` is missing, unreadable, or cannot be parsed, the gate and CI check treat every document as unapproved and block code from proceeding. A corrupt config file is never silently downgraded to "anyone can approve."

---

## The `workflows.json` file

`workflows.json` lives in the vault directory and has one top-level key per document type: `spec`, `plan`, and `adr`. Each key holds a `WorkflowConfig` object.

```json
{
  "spec": {
    "required_approvers": ["alice@example.com"],
    "approval_mode": "unanimous",
    "min_approvals": 1,
    "require_diagram": true
  },
  "plan": {
    "required_approvers": [],
    "approval_mode": "unanimous",
    "min_approvals": 1
  },
  "adr": {
    "required_approvers": [],
    "approval_mode": "unanimous",
    "min_approvals": 1
  }
}
```

### Fields

| Field | Type | Default | Meaning |
|---|---|---|---|
| `required_approvers` | `string[]` | `[]` | Git emails of the reviewers whose approval counts. Empty means any reviewer can satisfy the policy. |
| `approval_mode` | `"unanimous"` \| `"threshold"` | `"unanimous"` | Whether all listed approvers must approve (`unanimous`) or only a minimum count (`threshold`). Absent field defaults to `unanimous`. |
| `min_approvals` | `number` | `1` | When `approval_mode` is `threshold`, the minimum number of `required_approvers` who must approve. Must be ≥ 1. |
| `require_diagram` | `boolean` | `false` | When `true`, the document must contain a Mermaid block or an image before it can be approved. New vaults default `spec.require_diagram` to `true`; `plan` and `adr` default to `false`. |

---

## Approval modes

### `unanimous` (default)

Every reviewer listed in `required_approvers` must have approved the current version of the document. If even one listed reviewer has requested changes or has not yet approved, the document is not approved.

If `required_approvers` is empty and mode is `unanimous`, any single reviewer's approval satisfies the policy.

### `threshold`

At least `min_approvals` of the `required_approvers` must approve. The rest do not need to act. This is useful when you have a pool of eligible reviewers and want a quorum rather than consensus.

> Note: `min_approvals` is capped at the length of `required_approvers`. Setting `min_approvals: 3` with only two listed approvers behaves as if `min_approvals: 2`.

---

## Staleness and content hashes

Every approval is recorded against the document's content hash at the time of approval. If the document changes after an approval, that reviewer's approval is considered stale and no longer counts toward the policy. The document's status reverts to a non-approved state until the required reviewers re-approve. See [Reviewing & approving](04-reviewing-and-approving.md) for more detail.

---

## Diagram gating

When `require_diagram: true` is set for a document type, a document cannot reach `approved` status until it contains a Mermaid diagram block or an embedded image. In the desktop app, the **Approve** button is disabled and the panel shows:

> ⚠ Diagram required — add a mermaid block or an image before this can be approved.

If the document content cannot be read (for example because the file path is missing from the manifest), the diagram requirement is treated as **unmet** — the document cannot be approved. This is the same fail-closed principle as a missing `workflows.json`.

---

## Tier overrides

The `heavy` tier forces `approval_mode: "unanimous"` for its gating document (plan), regardless of what `workflows.json` says. This cannot be overridden by the workflow config alone. You must change the feature's tier to `standard` to allow threshold mode.

See [Feature tiers](06-feature-tiers.md) for the full list of per-tier effects.

---

## Two ways to configure the policy

### 1. Edit `workflows.json` directly

Open `<project>/.signoff/workflows.json` in any text editor, make your changes, save, and commit. The gate and CI check read the file on every evaluation, so the change takes effect immediately for new approval checks.

### 2. Use Reviewer settings in the desktop app

In the SignOff desktop app, open the vault and click **Reviewers** in the top-right corner of the review panel. This opens the **Reviewer settings** panel.

The panel has three sections — **Spec**, **Plan**, and **ADR** — each with:

- An approvers input labeled **Spec approvers** / **Plan approvers** / **ADR approvers** — a comma-separated list of git emails. Leave empty to allow any reviewer.
- An **Approval rule** radio group with two options:
  - **All listed approvers** — maps to `approval_mode: "unanimous"`
  - **At least N** — maps to `approval_mode: "threshold"`. When selected, a **Minimum approvals** number input appears.
- A **Require a diagram** checkbox.

Click **Save** to write the changes to `workflows.json` and return to the review panel. The vault commits the updated file under your git identity.

---

## Worked examples

### Single approver

One specific person must approve all specs. Any reviewer can approve plans. New vault defaults apply to ADR.

```json
{
  "spec": {
    "required_approvers": ["lead@example.com"],
    "approval_mode": "unanimous",
    "min_approvals": 1,
    "require_diagram": true
  },
  "plan": {
    "required_approvers": [],
    "approval_mode": "unanimous",
    "min_approvals": 1
  },
  "adr": {
    "required_approvers": [],
    "approval_mode": "unanimous",
    "min_approvals": 1
  }
}
```

A spec is approved when `lead@example.com` approves the current version. No other reviewer's approval counts unless `required_approvers` is empty.

### Unanimous 3-of-3

All three listed reviewers must approve before a spec can proceed.

```json
{
  "spec": {
    "required_approvers": [
      "alice@example.com",
      "bob@example.com",
      "carol@example.com"
    ],
    "approval_mode": "unanimous",
    "min_approvals": 1,
    "require_diagram": true
  },
  "plan": {
    "required_approvers": [],
    "approval_mode": "unanimous",
    "min_approvals": 1
  },
  "adr": {
    "required_approvers": [],
    "approval_mode": "unanimous",
    "min_approvals": 1
  }
}
```

If any one of the three requests changes, the spec is immediately in "Changes Requested" state.

### 2-of-3 threshold

Any two of three listed reviewers approving is sufficient. The third does not need to act.

```json
{
  "spec": {
    "required_approvers": [
      "alice@example.com",
      "bob@example.com",
      "carol@example.com"
    ],
    "approval_mode": "threshold",
    "min_approvals": 2,
    "require_diagram": true
  },
  "plan": {
    "required_approvers": [],
    "approval_mode": "unanimous",
    "min_approvals": 1
  },
  "adr": {
    "required_approvers": [],
    "approval_mode": "unanimous",
    "min_approvals": 1
  }
}
```

Two fresh approvals from the listed reviewers satisfy the policy. A request for changes from any listed reviewer still moves the document to "Changes Requested."

---

## Fail-closed behaviour

The following conditions all prevent a document from reaching approved status:

- `workflows.json` is missing from the vault.
- `workflows.json` cannot be parsed (malformed JSON).
- `require_diagram` is `true` and the document does not contain a diagram.
- `require_diagram` is `true` and the document file cannot be read.

In every case the gate blocks code and `check_approval` returns a non-approved status. There is no fallback to a permissive policy.

---

## See also

- [Reviewing & approving](04-reviewing-and-approving.md) — how reviewers use the desktop app
- [GitHub enforcement](11-github-enforcement.md) — CI-level gating via `signoff-ci check`
