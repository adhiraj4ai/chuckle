# 12. Reference

Complete, authoritative reference for SignOff's vault layout, configuration schema, MCP tools, CLIs, environment variables, statuses, and tiers.

---

## Vault layout

A vault lives at `<project-root>/.signoff/` by default. It is a standalone git repository. The files SignOff owns are:

| File / path | What it holds |
|---|---|
| `config.json` | Vault metadata: name, creation time, doc_roots. |
| `workflows.json` | Per-type approval workflow configuration (spec, plan, adr). |
| `index.json` | The manifest (v2): categories and feature index. |
| `approvals/<feature>.<type>.json` | Approval record for one (feature, document-type) pair. |
| `README.md` | Human-readable header committed when the vault was initialized. |

---

## `config.json`

Written when the vault is created. Edit by hand or via the SignOff desktop app's vault settings.

```json
{
  "name": "my-project",
  "created_at": "2026-06-27T10:00:00.000Z",
  "doc_roots": ["docs"]
}
```

| Field | Type | Description |
|---|---|---|
| `name` | string | Display name for the vault. |
| `created_at` | string (ISO 8601 UTC) | Timestamp when the vault was initialized. |
| `doc_roots` | string[] | Directories (relative to the project root) that the gate treats as doc-authoring areas. Defaults to `["docs"]` when absent. |

> Note: A legacy `org` field may be present in older vaults. It is not used by the current workflow.

---

## `workflows.json`

Defines one `WorkflowConfig` object per document type. The top-level keys are exactly `spec`, `plan`, and `adr`.

```json
{
  "spec": {
    "required_approvers": ["lead@example.com"],
    "min_approvals": 1,
    "approval_mode": "unanimous",
    "require_diagram": true
  },
  "plan": {
    "required_approvers": [],
    "min_approvals": 1,
    "approval_mode": "unanimous"
  },
  "adr": {
    "required_approvers": [],
    "min_approvals": 1,
    "approval_mode": "unanimous"
  }
}
```

### `WorkflowConfig` fields

| Field | Type | Required | Default when absent | Description |
|---|---|---|---|---|
| `required_approvers` | string[] | No | `[]` (any reviewer) | Git-config email addresses that must approve. An empty array means any reviewer can approve. |
| `optional_approvers` | string[] | No | (none) | Reviewers who may approve but are not required. Accepted for forward-compatibility; **not currently enforced** by the gate. |
| `min_approvals` | number (≥1) | Yes | — | Number of approvals required to satisfy `threshold` mode. |
| `approval_mode` | `"unanimous"` \| `"threshold"` | No | `"unanimous"` | `unanimous` — all `required_approvers` must approve. `threshold` — at least `min_approvals` of them must approve. |
| `require_diagram` | boolean | No | `false` | When `true`, a document cannot be approved until it contains a Mermaid block or an image. New vaults default `spec.require_diagram` to `true`; plan and adr default to `false`. |

---

## `index.json` (the manifest)

The manifest tracks which documents belong to which features, plus categories, tags, tier, and ticket. It is always written at version 2.

```json
{
  "version": 2,
  "categories": [
    { "id": "backend", "name": "Backend", "color": "blue" }
  ],
  "features": {
    "user-auth": {
      "spec": "docs/specs/2026-06-27-user-auth-design.md",
      "plan": "docs/plans/2026-06-27-user-auth-plan.md",
      "category": "backend",
      "tags": ["auth", "security"],
      "tier": "heavy",
      "ticket": { "id": "PROJ-42", "url": "https://linear.app/proj/issue/PROJ-42" }
    }
  }
}
```

### Top-level fields

| Field | Type | Description |
|---|---|---|
| `version` | `2` | Always `2`. |
| `categories` | `Category[]` | Ordered list of all categories defined for this vault. |
| `features` | `Record<string, FeatureDocs>` | Map from feature slug to its document index entry. |

### `Category`

| Field | Type | Description |
|---|---|---|
| `id` | string | URL-safe slug (auto-generated from `name`). Used as the foreign key in `FeatureDocs.category`. |
| `name` | string | Display name, e.g. `"Backend"`. |
| `color` | string | Color token assigned by SignOff (e.g. `"blue"`). Set automatically; not a free-form value. |

### `FeatureDocs`

| Field | Type | Description |
|---|---|---|
| `spec` | string (optional) | Project-relative path to the spec document. |
| `plan` | string (optional) | Project-relative path to the plan document. |
| `adr` | string (optional) | Project-relative path to the ADR document. |
| `category` | string (optional) | `Category.id` of the assigned category. Absent means uncategorized. |
| `tags` | string[] (optional) | Free-form labels, normalized (trimmed, lowercased). |
| `tier` | string (optional) | Risk tier: `light`, `standard`, or `heavy`. Absent is treated as `standard`. |
| `ticket` | `Ticket` (optional) | External tracker reference. |

### `Ticket`

| Field | Type | Description |
|---|---|---|
| `id` | string | Ticket identifier, e.g. `PROJ-123`. |
| `url` | string (optional) | HTTP(S) URL to the ticket. Non-HTTP(S) URLs are dropped. |

---

## `approvals/<feature>.<type>.json`

One file per (feature, document-type) pair, e.g. `approvals/user-auth.spec.json`. SignOff manages these files; do not hand-edit them. The `status` field is derived from reviewer states and history — it is never set manually.

Key fields for reference:

| Field | Description |
|---|---|
| `feature` | Feature slug. |
| `type` | Document type: `spec`, `plan`, or `adr`. |
| `status` | Derived status (see [Statuses](#statuses) below). |
| `reviewers` | Map of reviewer email → `ReviewerState` (their current per-reviewer status). |
| `history` | Ordered list of `ApprovalHistoryEntry` objects with `action`, `by`, `at`, and optional `message` and `content_hash`. |

---

## MCP tools

These tools are exposed by the MCP server (`@signoff/mcp-server`, bin `signoff-mcp`) to Claude Code. They are invoked by Claude Code during a workflow, not by hand.

| Tool | Required params | Optional params | Notes |
|---|---|---|---|
| `publish_document` | `feature_name`, `document_type`, `document_path` | `category`, `tags`, `tier`, `ticket_id`, `ticket_url` | Registers the document in the vault, records a pending approval, and commits. No copy of the document is made; `document_path` is project-relative. `category` and `tier` are no-clobber suggestions (applied only if unset); `tags` are merged with existing tags. |
| `submit_for_review` | `feature_name`, `document_type`, `document_path` | `category`, `tags`, `tier`, `ticket_id`, `ticket_url` | Alias for `publish_document`. Used by the workflow skill. Identical parameters and behaviour. |
| `check_approval` | `feature_name`, `document_type` | — | Returns `status` (`pending`\|`in_review`\|`approved`\|`rejected`\|`not_found`), and optional `stale`, `missing_diagram`, `approved_by`, `approved_at` fields. Pulls latest vault state first. **Known limitation:** `document_type` only accepts `spec` or `plan`; passing `adr` returns an error. Use the SignOff desktop app to check ADR approval status. |
| `list_pending` | (none) | — | Lists all documents in the vault currently awaiting review (status = `pending`). |

### `publish_document` / `submit_for_review` parameter details

| Parameter | Type | Required | Description |
|---|---|---|---|
| `feature_name` | string | Yes | Feature slug, e.g. `user-auth`. |
| `document_type` | `"spec"` \| `"plan"` \| `"adr"` | Yes | The type of document being published. |
| `document_path` | string | Yes | Project-relative path to the document, e.g. `docs/specs/2026-06-27-user-auth-design.md`. |
| `category` | string | No | Suggested category name. Created if absent; ignored if a reviewer already set one. |
| `tags` | string[] | No | Suggested free-form tags. Merged with any existing tags on the feature. |
| `tier` | `"light"` \| `"standard"` \| `"heavy"` | No | Suggested risk tier. Applied only if the feature has no tier yet (no-clobber). |
| `ticket_id` | string | No | External ticket identifier, e.g. `PROJ-123`. |
| `ticket_url` | string | No | HTTP(S) URL to the external ticket. |

---

## CLIs

### `signoff-mcp`

The MCP server binary. Invoked by Claude Code (via the plugin config) when a session opens. Not normally run by hand.

```bash
signoff-mcp
```

### `signoff-gate`

The PreToolUse hook binary. Invoked by Claude Code automatically before every code-editing tool call. Fails closed — if the vault is unreadable or the feature's gating doc is not approved, the tool call is blocked. Not run by hand.

```bash
signoff-gate
```

### `signoff-report`

Prints an approval-coverage report to stdout.

```bash
signoff-report [--vault <path>] [--format md|csv]
```

| Flag | Default | Description |
|---|---|---|
| `--vault <path>` | `./.signoff` (relative to cwd) | Path to the vault directory. |
| `--format <md\|csv>` | `md` | Output format. `md` produces a Markdown table; `csv` produces comma-separated values. |

Exit codes: `0` on success, `1` on vault error, `2` if `--format` is not `md` or `csv`.

### `signoff-ci`

CI enforcement binary. Two subcommands:

#### `signoff-ci check`

Verifies that the feature's gating document is approved. Exits non-zero if not.

```bash
signoff-ci check [--feature <slug>] [--pr-body <text>] [--branch <name>] [--project <dir>]
```

| Flag | Env fallback | Description |
|---|---|---|
| `--feature <slug>` | `SIGNOFF_FEATURE` | Feature slug to check. If omitted, SignOff infers the feature from the PR body trailer (`Signoff-Feature: <slug>`) or branch name. |
| `--pr-body <text>` | `SIGNOFF_PR_BODY` | Full PR body text. Used to infer the feature from a `Signoff-Feature:` trailer. |
| `--branch <name>` | `SIGNOFF_BRANCH`, then `GITHUB_HEAD_REF` | Branch name. Used to infer the feature slug from the branch name when no PR body trailer is present. |
| `--project <dir>` | cwd | Project root directory. SignOff looks for `.signoff` under this path. |

Exit codes: `0` if approved, `1` if not approved or blocked, `2` if the feature could not be determined.

#### `signoff-ci clone-vault`

Clones the vault repository in CI so `signoff-ci check` can read it.

```bash
signoff-ci clone-vault <url> <dest>
```

| Argument | Description |
|---|---|
| `<url>` | Git URL of the vault repository. |
| `<dest>` | Local destination path for the clone. |

Uses the `VAULT_TOKEN` environment variable (if set) to authenticate the clone.

---

## Environment variables

| Variable | Used by | Description |
|---|---|---|
| `SIGNOFF_HOME` | All components | Overrides `~/.signoff` as the vaults registry and settings directory. Use for test isolation or multi-home setups. |
| `SIGNOFF_FEATURE` | `signoff-ci check` | Feature slug. Fallback when `--feature` is not passed. |
| `SIGNOFF_PR_BODY` | `signoff-ci check` | Full PR body text. Fallback when `--pr-body` is not passed. Used to extract a `Signoff-Feature:` trailer. |
| `SIGNOFF_BRANCH` | `signoff-ci check` | Branch name. Fallback when `--branch` is not passed. |
| `GITHUB_HEAD_REF` | `signoff-ci check` | Branch name set by GitHub Actions. Used as a second fallback after `SIGNOFF_BRANCH`. |
| `VAULT_TOKEN` | `signoff-ci clone-vault` | Authentication token for cloning a private vault repository. |

---

## Statuses

Approval status for a (feature, document-type) pair. Derived from the approval record; never set manually.

| Status | Meaning |
|---|---|
| `pending` | Submitted, waiting for a reviewer to start review. |
| `in_review` | At least one reviewer has started review. |
| `approved` | Approval policy satisfied (all required approvers, or threshold met). |
| `rejected` | Changes were requested and the document has not been resubmitted. |
| `not_found` | No approval record exists for this (feature, type). |

---

## Tiers

Risk tier for a feature. Controls which document gates code and whether unanimous mode is forced.

| Tier | Gating artifact | Unanimous forced? | Default? |
|---|---|---|---|
| `light` | `spec` | No | |
| `standard` | `plan` | No | Yes |
| `heavy` | `plan` | Yes (overrides `approval_mode`) | |

Absent or unrecognized tier values normalize to `standard`.

See [Feature tiers](06-feature-tiers.md) for full detail on when to choose each tier.

---

## See also

- [Feature tiers](06-feature-tiers.md) — tier selection and gate behaviour
- [Approval policy](05-approval-policy.md) — `approval_mode`, `min_approvals`, `required_approvers`
- [Diagram gating](07-diagram-gating.md) — `require_diagram`
- [CI enforcement](11-github-enforcement.md) — `signoff-ci` in GitHub Actions
- [Reporting](10-reporting.md) — `signoff-report`
- [Troubleshooting](13-troubleshooting.md) — common problems and fixes
