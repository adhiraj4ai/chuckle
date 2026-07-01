# SignOff Operation Guide

A task-oriented guide to running SignOff day to day — for the three people who
touch it: the **developer** who drives Claude Code and publishes documents, the
**reviewer** who approves them in the desktop app, and the **admin/lead** who
configures approval policy and enforcement.

New here? Read chapters 1–3 in order, then dip into the feature chapters as you
need them. The [Reference](12-reference.md) and [Troubleshooting](13-troubleshooting.md)
chapters are lookup material.

## Chapters

| # | Chapter | For | What it covers |
|---|---------|-----|----------------|
| 1 | [Introduction & concepts](01-introduction.md) | everyone | What SignOff is, the gate model, the vault, roles |
| 2 | [Getting started](02-getting-started.md) | developer, admin | Install, initialize/open a vault, connect Claude Code, run the desktop app |
| 3 | [The core workflow](03-core-workflow.md) | developer | The spec → plan → implement loop and how the gate behaves |
| 4 | [Reviewing & approving](04-reviewing-and-approving.md) | reviewer | The desktop app: find features, review, approve / request changes, comments, staleness |
| 5 | [Approval policy](05-approval-policy.md) | admin | Required approvers, unanimous vs threshold (M-of-N), `min_approvals` |
| 6 | [Feature tiers](06-feature-tiers.md) | admin, developer | `light` / `standard` / `heavy` — scaling the gate to risk |
| 7 | [Diagram gating](07-diagram-gating.md) | admin, developer | Require a diagram before approval; what counts, how to satisfy it |
| 8 | [Decision records (ADR)](08-decision-records-adr.md) | developer, reviewer | Approvable-but-non-gating architecture decision records |
| 9 | [Organizing work](09-organizing-work.md) | everyone | Categories, tags, and ticket linking |
| 10 | [Reporting](10-reporting.md) | admin, lead | The `signoff-report` CLI (coverage, Markdown/CSV) |
| 11 | [GitHub enforcement](11-github-enforcement.md) | admin | The `signoff-ci` required check + reusable workflow |
| 12 | [Reference](12-reference.md) | everyone | Vault files, `workflows.json` / `index.json` / `config.json`, MCP tools, CLIs, env vars |
| 13 | [Troubleshooting & FAQ](13-troubleshooting.md) | everyone | Common situations and their fixes |

## See also

- [Project README](../../README.md) — overview, install, and development.
- [GitHub enforcement setup](../github-enforcement.md) — the full CI walkthrough (vault token, secrets, branch protection).
- [CHANGELOG](../../CHANGELOG.md) — what changed in each release.
