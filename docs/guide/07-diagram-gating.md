# 7. Diagram gating

The `require_diagram` setting blocks a document from reaching **approved** until it contains a recognized diagram — it never blocks authoring or publishing, only the final approval step.

---

## What it is

Each document type (spec, plan, adr) has its own `require_diagram` flag in `workflows.json`. When set to `true` for a type, any document of that type must contain a diagram before a reviewer can approve it. The reviewer sees a warning in the review panel and the Approve button is disabled until the requirement is met.

---

## Default behavior

New vaults are created with the following defaults:

| Type | `require_diagram` default |
|---|---|
| `spec` | `true` |
| `plan` | `false` |
| `adr` | `false` |

These defaults reflect the typical expectation that a spec should describe the system visually, while plans and ADRs are more text-oriented. All three can be changed independently.

---

## What counts as a diagram

In v1, exactly two things satisfy the requirement:

1. **A fenced Mermaid block** — a code fence whose info string starts with `mermaid` (case-insensitive):

   ````
   ```mermaid
   graph LR
     A --> B
   ```
   ````

2. **An embedded markdown image** — standard `![alt](url)` syntax with a non-empty URL:

   ```markdown
   ![Architecture overview](./architecture.png)
   ```

Nothing else qualifies. Inline HTML `<img>` tags, PlantUML fences, Graphviz/DOT fences, and plain text descriptions are not recognized in v1.

> Note: If the document content cannot be read at approval time (e.g. the path is missing from the manifest or the file is unreadable), the requirement is treated as unmet. The gate fails closed: it cannot approve what it cannot inspect.

---

## How to turn it on or off

### Reviewer settings (SignOff desktop app)

Open the SignOff desktop app and go to **Reviewer settings**. Each document type — Spec, Plan, ADR — has its own section. Each section has a **Require a diagram** checkbox. Check or uncheck to enable or disable the requirement for that type. The change writes to `workflows.json` in the vault.

### Direct config edit (`workflows.json`)

Edit `<project>/.signoff/workflows.json` and set or remove `"require_diagram": true` on the relevant type:

```json
{
  "spec": {
    "required_approvers": [],
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

Omitting `require_diagram` is equivalent to `false`.

> Note: Existing vaults are not affected by the new-vault default. If you open a vault that was created before diagram gating was introduced, its `workflows.json` will not have `require_diagram` set, and the behavior will be `false` until you explicitly enable it.

---

## What the reviewer sees

When a document requires a diagram but does not contain one:

- A **"⚠ Diagram required"** notice appears in the review panel.
- The **Approve** button is disabled.
- The reviewer can still start a review, request changes, or leave comments. Only the final Approve action is blocked.

The notice clears and the Approve button re-enables as soon as the developer adds a diagram and re-publishes the document.

---

## What the developer sees

When `check_approval` returns for a document that is not yet approved and the diagram requirement is unmet:

```json
{
  "status": "in_review",
  "missing_diagram": true
}
```

The `missing_diagram: true` field is present in the response whenever the requirement is configured and not satisfied, regardless of the current approval status. When the requirement is satisfied (or not configured), the field is absent.

---

## How to satisfy the requirement

1. Add a `\`\`\`mermaid` block or an `![alt](url)` image to the document.
2. Re-publish the document:

   ```
   publish_document(
     feature_name="user-auth",
     document_type="spec",
     document_path="docs/user-auth-design.md"
   )
   ```

3. The reviewer's Approve button re-enables on their next sync.

The preferred approach for specs is a Mermaid block — it is versionable in git, diffable in code review, and renders directly in the SignOff desktop app's document pane.

---

## Key point: authoring is never blocked

Diagram gating is a gate on **approval**, not on publishing. You can:

- Publish a spec with no diagram at any time.
- Re-publish the spec multiple times while iterating.
- Receive review comments on a spec that lacks a diagram.

The only action blocked is the reviewer clicking Approve on a document that has no diagram when the type requires one.

---

## See also

- [Feature tiers](06-feature-tiers.md) — tier controls which document gates code
- [Approval policy](05-approval-policy.md) — `required_approvers`, `approval_mode`, `min_approvals`
- [Decision records (ADR)](08-decision-records-adr.md) — ADR defaults to `require_diagram: false`
