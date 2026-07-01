# 10. Reporting

Generate an approval-coverage report for your vault to see where each feature stands — useful before a release review meeting or to track progress across a sprint.

---

## The `signoff-report` command

`signoff-report` reads your vault and prints a coverage report to stdout.

```
signoff-report [--vault <path>] [--format md|csv]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--vault <path>` | `./.signoff` | Path to the SignOff vault directory |
| `--format md\|csv` | `md` | Output format — Markdown or CSV |

The command exits with code `0` on success, `1` if the vault cannot be read, and `2` if you pass an unrecognized `--format` value.

---

## What the report covers

The report covers **spec** and **plan** documents only. ADR documents are tracked in the vault but are not included in report coverage.

For each feature the report shows:

| Column | Values |
|--------|--------|
| Feature | The feature slug (e.g. `user-auth`) |
| Spec | `approved`, `in_review`, `pending`, `rejected`, or `—` (not published) |
| Plan | Same as Spec |

A `(stale)` suffix appears when the document has changed since it was last approved — meaning the approval was granted on an earlier version of the file.

The report header shows aggregate counts:

- **Features** — total number of features in the vault
- **Approved spec** — count and percentage of features with an approved spec
- **Approved plan** — count and percentage of features with an approved plan
- **Stale approvals** — total number of stale spec or plan approvals across all features
- **By status (spec+plan docs)** — breakdown of all spec+plan document statuses: how many are `approved`, `in_review`, `pending`, `rejected`, or have no document (`none`)

---

## Example invocations

Run from your project root (where `.signoff` is the subdirectory):

```sh
signoff-report
```

Specify a vault in a different location:

```sh
signoff-report --vault /path/to/project/.signoff
```

Write a Markdown report to a file:

```sh
signoff-report --vault ./.signoff --format md > approval-report.md
```

Write a CSV for import into a spreadsheet or dashboard:

```sh
signoff-report --vault ./.signoff --format csv > approval-report.csv
```

---

## Sample Markdown output

```markdown
# SignOff approval report

- Features: 4
- Approved spec: 3/4 (75%)
- Approved plan: 2/4 (50%)
- Stale approvals: 1
- By status (spec+plan docs): approved 5 · in_review 1 · pending 0 · rejected 0 · none 2

| Feature | Spec | Plan |
|---|---|---|
| billing | approved | approved |
| notifications | approved | approved (stale) |
| payments | approved | in_review |
| user-auth | approved | — |
```

The `(stale)` flag on `notifications / Plan` means the plan document was edited after its approval — it needs re-review.

---

## Sample CSV output

```csv
feature,spec,plan,spec_stale,plan_stale
billing,approved,approved,false,false
notifications,approved,approved,false,true
payments,approved,in_review,false,false
user-auth,approved,,false,false
```

CSV columns: `feature`, `spec`, `plan`, `spec_stale`, `plan_stale`. Empty `spec` or `plan` cells mean the document has not been published. The `spec_stale` and `plan_stale` columns are `true`/`false` strings.

---

## Using the report in practice

**Before a release gate meeting:** run `signoff-report --format md` and paste the output into your meeting notes or a pull request description. The aggregate line gives reviewers an instant summary; the per-feature table lets them spot gaps.

**In a CI/CD dashboard:** add a step that runs `signoff-report --format csv` and uploads or posts the CSV to your reporting tool. The CSV format is stable and easy to parse.

**Tracking stale approvals:** the `Stale approvals` count and `(stale)` row annotations tell you which documents need re-review after late edits. A stale plan approval will also cause the `signoff-ci check` to fail — the CI check verifies the approved content hash. Fix by requesting a fresh review and re-approval in the SignOff desktop app.

---

## Scope notes

- ADR documents are not included in report coverage. The report covers spec and plan only. This is a known limitation — ADRs appear in the vault and can be approved, but they do not show up in the report output.
- Categories, tags, and ticket data are not included in the report output. See [Organizing work](09-organizing-work.md).
- The report reads directly from the vault on disk. If your vault is a separate git repository (as in CI setups), run `git pull` in the vault directory first, or use `signoff-ci clone-vault` to get a fresh copy.

---

## See also

- [Organizing work](09-organizing-work.md) — categories, tags, and tickets
- [GitHub enforcement](11-github-enforcement.md) — how stale approvals block PRs in CI
- [Feature tiers](06-feature-tiers.md) — how tier affects what must be approved
