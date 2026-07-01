# 13. Troubleshooting & FAQ

Common problems, their causes, and how to fix them.

---

## The gate blocked my code edit

**Symptom.** Claude Code stops before editing a source file and reports that the feature is not approved (or no active feature is set).

**Cause.** The gate (`signoff-gate`) runs as a PreToolUse hook before every code-editing tool call. It fails closed: if the feature's gating document is not approved — or if no feature can be determined — the edit is blocked. There are three common sub-cases:

1. **No active feature.** Claude Code does not know which feature this session is for.
2. **The gating document has not been published or is still pending.** The spec (for a `light` feature) or plan (for `standard` or `heavy`) has not been submitted and approved yet.
3. **The feature's tier requires a higher-tier document.** A `standard` feature needs a plan approved, not just a spec.

**Fix.**

1. Confirm the active feature by setting it in the Claude Code session context (the `SIGNOFF_FEATURE` environment variable, or by asking Claude Code which feature is in scope).
2. If the gating document has not been published, publish it with `publish_document` and wait for reviewer approval.
3. If the document is published but still pending or in review, wait for a reviewer to approve it in the SignOff desktop app. Then ask Claude Code to proceed — it will pull the latest vault state and re-check.

> Note: Never bypass the gate by writing files directly outside Claude Code. The gate is the control point. Work with it, not around it.

See also: [Feature tiers](06-feature-tiers.md), [Approval policy](05-approval-policy.md).

---

## Approve is disabled / "⚠ Diagram required"

**Symptom.** In the SignOff desktop app's Review panel, the **Approve** button is greyed out and the notice "⚠ Diagram required" appears.

**Cause.** The workflow for this document type has `require_diagram: true` in `workflows.json`. The document does not currently contain a Mermaid block or an embedded image, so approval is blocked.

**Fix.**

1. Open the document in your editor and add a Mermaid diagram (fenced with ` ```mermaid `) or an image (`![alt](path)`).
2. Save the file and republish it with `publish_document` (this re-submits and commits the updated path).
3. The reviewer can then re-open the document in the desktop app — `missing_diagram` will be cleared and **Approve** will be enabled.

If diagrams are genuinely not applicable for this document type (e.g. an ADR or a small plan), an admin can uncheck **Require a diagram** in the Reviewer settings panel for that type.

See also: [Diagram gating](07-diagram-gating.md).

---

## My approval isn't showing to the developer / `check_approval` still returns pending

**Symptom.** A reviewer approved a document in the desktop app, but `check_approval` (or the gate) still reports `pending` or `in_review`.

**Cause.** Approvals are written as git commits in the vault repository. The approval is only visible to other machines after those commits are pushed and pulled. If the vault's remote has not been pushed, or if the developer's environment has not pulled, the approval record is locally out of date.

**Fix.**

1. **Reviewer:** after approving, use the **Sync** button in the desktop app sidebar (or `git push` in the vault directory) to push the approval commits to the remote.
2. **Developer:** pull the vault manually (`git pull` in `<project>/.signoff/`), or wait for the MCP server to pull on the next `check_approval` call (it pulls before reading the record). You can also ask Claude Code to re-check the approval.

> Note: `check_approval` pulls the latest vault state before returning its result. If the reviewer pushed but the pull still shows stale data, check whether the vault remote URL is correctly configured.

---

## Approved doc went back to needing approval

**Symptom.** A document was previously approved, but the gate now blocks code again, or `check_approval` returns `stale: true`.

**Cause.** The document's content changed after it was approved. SignOff pins a SHA-256 content hash to each approval. If the file on disk no longer matches the hash recorded at approval time, the record is marked stale. This is intentional — a material change to a spec or plan after approval invalidates the previous sign-off.

**Fix.**

1. Review the changes you made to the document.
2. If the changes are substantive, republish the document with `publish_document` to create a new submission, and ask reviewers to re-approve.
3. If the changes were trivial (whitespace, typo fix), discuss with your reviewer whether a re-review is warranted. Either way, republish to reset the content hash to the current state.

---

## `check_approval` errors on an ADR

**Symptom.** Calling `check_approval` with `document_type="adr"` returns an error from Claude Code.

**Cause.** This is a known limitation of the current MCP tool implementation. The `check_approval` tool's schema only accepts `spec` or `plan` as `document_type`. Passing `adr` is rejected at the schema validation layer.

**Fix.** To check ADR approval status, open the feature in the SignOff desktop app. The **ADR** tab in the Document pane shows the current approval state, and the Review panel lets reviewers act on it directly.

`publish_document` and `submit_for_review` do accept `adr`, so publishing ADRs works normally — only the check tool is limited.

See also: [Decision records (ADR)](08-decision-records-adr.md), [Reference — MCP tools](12-reference.md#mcp-tools).

---

## Wrong feature name

**Symptom.** The feature is indexed under an unexpected slug, e.g. `2026-06-27-user-auth` instead of `user-auth`.

**Cause.** Feature slugs are inferred from the document filename by stripping a leading date prefix (`YYYY-MM-DD-`) and a trailing type suffix (`-design`, `-spec`, `-plan`). If the filename does not follow this convention, the full stem is used as the slug.

For example:
- `2026-06-27-user-auth-design.md` → `user-auth`
- `user-auth-design.md` → `user-auth`
- `user_auth_spec_v2.md` → `user_auth_spec_v2` (no recognised suffix stripped)

**Fix.** Pass `feature_name` explicitly to `publish_document` to set the exact slug you want:

```
publish_document(
  feature_name="user-auth",
  document_type="spec",
  document_path="docs/user_auth_spec_v2.md"
)
```

The slug recorded in the vault is whatever you pass as `feature_name`. Once set, use the same slug consistently across all publish and check calls for that feature.

---

## Which document unblocks code?

**Question.** I've published both a spec and a plan. Which one does the gate check?

**Answer.** The gate checks the **gating artifact** for the feature's tier:

| Tier | Gating artifact |
|---|---|
| `light` | spec |
| `standard` (default) | plan |
| `heavy` | plan (unanimous mode forced) |

For a `standard` or `heavy` feature, the plan must be approved to unblock code. The spec must be published before the plan can be submitted, but spec approval alone is not sufficient.

To check the current tier for a feature, open it in the SignOff desktop app (FeatureMetaBar shows the tier radio buttons) or look at the `tier` field in `index.json`.

See also: [Feature tiers](06-feature-tiers.md).

---

## `signoff-report` says unknown --format

**Symptom.** Running `signoff-report --format json` (or another value) prints an error and exits with code 2.

**Cause.** `signoff-report` only accepts two values for `--format`: `md` and `csv`. Any other value is rejected.

**Fix.** Use one of the two supported formats:

```bash
signoff-report --vault .signoff --format md
signoff-report --vault .signoff --format csv
```

The default format when `--format` is omitted is `md`.

See also: [Reporting](10-reporting.md), [Reference — CLIs](12-reference.md#clis).

---

## CI check can't find the feature

**Symptom.** `signoff-ci check` exits with code 2 and prints: `SignOff: could not determine the feature. Add Signoff-Feature: <slug> to the PR body.`

**Cause.** `signoff-ci check` needs to know which feature to gate. It resolves the feature in this order:

1. `--feature <slug>` flag (or `SIGNOFF_FEATURE` env var).
2. A `Signoff-Feature: <slug>` trailer in the PR body (passed via `--pr-body` or `SIGNOFF_PR_BODY`).
3. Branch name (passed via `--branch`, `SIGNOFF_BRANCH`, or `GITHUB_HEAD_REF`).

If none of these yield a slug, the check fails with exit code 2.

**Fix.** Choose one of:

- Add a `Signoff-Feature: user-auth` line to the PR description before opening or updating the PR.
- Set the `SIGNOFF_FEATURE` environment variable in the CI workflow.
- Pass `--feature user-auth` directly to `signoff-ci check`.
- Name your branch in a way that matches the feature slug (e.g. `feature/user-auth` or `user-auth/implement`).

Example GitHub Actions step with an explicit feature:

```yaml
- name: SignOff gate
  run: signoff-ci check --feature user-auth --project .
```

See also: [CI enforcement](11-github-enforcement.md), [Reference — CLIs](12-reference.md#clis), [Reference — environment variables](12-reference.md#environment-variables).

---

## Desktop can't see my vault

**Symptom.** The SignOff desktop app shows an empty vault list, or a vault you created earlier does not appear.

**Cause.** The desktop app reads the vaults registry at `~/.signoff/vaults.json` (or `$SIGNOFF_HOME/vaults.json` if set). If a vault is not registered there, it will not appear in the sidebar.

There are two common sub-cases:

1. **The vault was created but never registered.** Running `VaultManager.create()` writes vault files but does not automatically add the vault to the registry on all code paths.
2. **`SIGNOFF_HOME` is set to a non-default location.** The desktop app and other tools are looking in different directories.

**Fix.**

- Open the SignOff desktop app, click **Open vault**, and navigate to the `<project>/.signoff/` directory. Opening a vault via the file picker registers it in the registry.
- If you are using `SIGNOFF_HOME`, ensure the same value is set in the environment where the desktop app launches. Check your shell profile (`.zshrc`, `.bashrc`, etc.) or the desktop app's launch environment.
- Confirm the registry file exists and is readable: `cat ~/.signoff/vaults.json` (or the `SIGNOFF_HOME` path).

See also: [Getting started](02-getting-started.md), [Reference — environment variables](12-reference.md#environment-variables).

---

## See also

- [Reference](12-reference.md) — complete flag, param, and config reference
- [Feature tiers](06-feature-tiers.md) — tier selection and gate behaviour
- [Approval policy](05-approval-policy.md) — workflow configuration
- [Diagram gating](07-diagram-gating.md) — `require_diagram`
- [CI enforcement](11-github-enforcement.md) — `signoff-ci` setup
- [Reporting](10-reporting.md) — `signoff-report`
