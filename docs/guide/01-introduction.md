# 1. Introduction

SignOff is a human approval gate for AI-assisted development — it requires a reviewer to sign off on a spec or plan document before Claude Code is allowed to write implementation code.

## The problem

AI coding agents are fast and eager. Without a checkpoint, an agent will happily implement a half-baked spec, generating code that has to be thrown away or refactored later. The bigger the change, the costlier the mistake.

SignOff inserts a deliberate human checkpoint between thinking and building. The agent writes a document, a human reviews it, and only then does the gate open for code changes.

## The gate model

The flow has four stages:

1. **Publish** — Claude Code writes a spec or plan and calls `publish_document` to push it into the vault.
2. **Review** — a reviewer reads the document in the SignOff desktop app and starts a review. They can leave comments and request changes.
3. **Approve** — the reviewer approves. The approval is committed to the vault under the reviewer's own git identity.
4. **Proceed** — Claude Code calls `check_approval`, sees the approved status, and is now allowed to edit code.

```
   Claude Code                  SignOff vault (git)              Reviewer
  ┌───────────┐   publish_document   ┌─────────────┐   pull/review   ┌──────────────┐
  │  agent    │ ───────────────────▶ │   spec.md   │ ──────────────▶ │ desktop app  │
  │           │                      │  approval   │                 │ approve /    │
  │           │ ◀─────────────────── │   record    │ ◀────────────── │ request      │
  └───────────┘    check_approval    └─────────────┘     commit      └──────────────┘
        │
        └── gated: implementation proceeds only once approved
```

The gate is **fail-closed**: if approval is missing, unclear, or not yet synced, the gate blocks. There is no bypass.

## The vault

The vault is a git repository that holds all approval state for a project. It lives at `<project>/.signoff` by default.

A vault contains:

| File | Purpose |
|---|---|
| `config.json` | Vault name, creation date, and `doc_roots` (directories the gate treats as doc-authoring areas, default `["docs"]`). |
| `workflows.json` | Per-document-type approval rules: required approvers, minimum approval count, approval mode, and diagram requirements. |
| `index.json` | The manifest (version 2). Tracks every known feature with its document paths, category, tags, tier, and optional ticket link. |
| `approvals/<feature>.<type>.json` | One approval record per (feature, type) pair. Holds the full reviewer history and a derived status. |
| `README.md` | Auto-generated vault metadata. |

Because the vault is a plain git repo, approvals sync over whatever mechanism your team already uses — a shared remote, a GitHub repo, or a local bare clone. There is no backend service to run.

## Document types

SignOff tracks three document types:

| Type | Purpose | Blocks code? |
|---|---|---|
| `spec` | What to build and why. Describes the feature from a user or product perspective. | Yes, for `light`-tier features. |
| `plan` | How to build it. Technical design, data model, API surface, implementation steps. | Yes, for `standard`- and `heavy`-tier features (the default). |
| `adr` | Architecture Decision Record. Captures why a non-obvious design choice was made. | No — ADRs are non-blocking. |

The relationship between document types and gating is controlled by the feature's **tier**. See [Feature tiers](06-feature-tiers.md) for details.

## Features

A **feature** is the unit of work that SignOff tracks. It is identified by a stable slug such as `user-auth`, inferred automatically from the document filename (for example, `2026-06-27-user-auth-design.md` → `user-auth`). The same slug is used across the spec, plan, ADR, and approval records for that feature.

## Roles

Three roles interact with SignOff:

**Developer** — the person (or agent) driving implementation. They ask Claude Code to write specs and plans. They hit the gate when they try to edit code before approval. They never touch approval records directly.

**Reviewer** — approves documents in the SignOff desktop app. Their git identity is recorded on every approval commit — not a bot signature, a real person.

**Admin / lead** — configures the vault: sets up `workflows.json` (required approvers, approval mode, diagram requirements), assigns feature tiers, and manages CI enforcement. This is often the same person as the reviewer on smaller teams.

## What comes next

- [Getting started](02-getting-started.md) — install the desktop app, initialize a vault, and wire up Claude Code.
- [The core workflow](03-core-workflow.md) — the spec → plan → implement loop step by step.

## See also

- [Getting started](02-getting-started.md)
- [The core workflow](03-core-workflow.md)
