# 6. Feature tiers

Each feature carries a **tier** that controls which document must be approved before code can proceed, and whether unanimous approval is required.

---

## The three tiers

| Tier | Gating artifact | Unanimous forced? | Default? |
|---|---|---|---|
| `light` | spec | No | |
| `standard` | plan | No | Yes |
| `heavy` | plan | Yes (regardless of `approval_mode`) | |

**`light`** — code is gated on spec approval only. No plan is required. Use this for small, well-understood changes where the spec is sufficient justification on its own.

**`standard`** (the default) — code is gated on plan approval. The spec must be published and approved before the plan can be submitted; the gate checks the plan. This is the right choice for the majority of features.

**`heavy`** — code is gated on plan approval, the same as standard, but the workflow's `approval_mode` setting is ignored: all listed required approvers must approve, regardless of whether the workflow is configured for `threshold` mode. Use this for high-risk changes — schema migrations, authentication systems, public API surface changes, or any work where a single approver is not sufficient.

> Note: The gate, `signoff-report`, and `signoff-ci` all read the tier from `index.json` via the same code path (`isClearedForCode`). There is no separate tier config to keep in sync.

---

## How to set a tier

You can set a tier in two ways.

### Via `publish_document` (Claude Code)

Pass `tier` as an argument when publishing:

```
publish_document(
  feature_name="user-auth",
  document_type="spec",
  document_path="docs/user-auth-design.md",
  tier="heavy"
)
```

The `tier` argument is **no-clobber**: it is applied only if the feature has no tier set yet. If the feature already has a tier in `index.json`, the argument is silently ignored. This means the first publish call that includes a tier wins, and later republishes do not accidentally change it.

### Via the SignOff desktop app (FeatureMetaBar)

Open the feature in the SignOff desktop app. The **FeatureMetaBar** at the top of the feature pane shows three radio buttons: **light**, **standard**, **heavy**. Select one to change the tier immediately. This change writes directly to `index.json` in the vault and is reflected on the next git pull.

---

## Tier badge in the sidebar

The sidebar shows a tier badge next to a feature's name for `light` and `heavy` features. Standard features carry no badge — standard is the expected default and does not need a visual callout.

---

## When to choose each tier

| Situation | Recommended tier |
|---|---|
| Small fix or isolated change, spec alone is sufficient | `light` |
| Normal feature work | `standard` |
| Database migrations, auth changes, public API additions | `heavy` |
| Any feature where one approver is insufficient | `heavy` |
| Prototyping or spike (no plan needed) | `light` |

> Note: Tiers do not prevent publishing documents of any type. A `light` feature can still have a plan published and reviewed — the plan just does not gate code. Use whichever documents are useful for the team.

---

## How the gate reads tiers

The gate (`signoff-gate`, wired as a Claude Code PreToolUse hook) calls `isClearedForCode(vaultPath, feature)`, which:

1. Reads the feature's `tier` from `index.json` (absent or unknown values normalize to `standard`).
2. Determines the gating artifact: `spec` for `light`, `plan` for `standard` and `heavy`.
3. For `heavy`, forces `approval_mode` to `unanimous` regardless of `workflows.json`.
4. Calls `getApprovalStatus` on the gating artifact.
5. Fails closed: if the vault is unreadable or the record is missing, code is blocked.

`signoff-ci check` and `signoff-report` follow the same logic.

---

## See also

- [Approval policy](05-approval-policy.md) — `approval_mode`, `min_approvals`, `required_approvers`
- [Diagram gating](07-diagram-gating.md) — `require_diagram` per document type
- [Decision records (ADR)](08-decision-records-adr.md) — non-gating document type
