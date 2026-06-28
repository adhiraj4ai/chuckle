# SignOff — Design Spec

**Date:** 2026-06-27  
**Status:** Draft  
**Author:** jugalraj

---

## Overview

SignOff is an open source markdown document review and approval platform for software development teams. It provides a structured approval gate for spec and plan documents produced by AI-assisted vibe coding tools (Claude Code, antigravity, etc.) before those documents are used to drive code generation. A bad spec fed to an AI tool is worse than no spec — SignOff ensures the right people sign off before the AI proceeds.

---

## Problem

When developers use superpowers skills (brainstorming, writing-plans) to produce spec and plan documents, those documents may need review and approval from solution architects, feature owners, team leads, or project managers before the AI is permitted to write code. Today there is no enforcement layer — documents are written to the project repo and the AI proceeds immediately regardless of approval status.

---

## Solution

SignOff has three components that work together:

1. **Electron desktop app** — Tolaria-style vault UI for rendering, organizing, and approving markdown documents
2. **MCP server** — integrates with Claude Code to publish documents and gate code generation on approval status
3. **Vault** — a dedicated git repo per project that stores documents and approval history

---

## Architecture

```
Developer's project repo
  docs/superpowers/specs/*.md
  docs/superpowers/plans/*.md
          │
          │ Claude Code calls signoff MCP → publish_document()
          ▼
SignOff Vault (dedicated git repo, one per project)
  features/<feature-name>/spec.md
  features/<feature-name>/spec.approval.json
  features/<feature-name>/plan.md
  features/<feature-name>/plan.approval.json
  .signoff/workflows.json
  .signoff/config.json
          │
          ├──────────────────────────────┐
          ▼                              ▼
SignOff Desktop App             SignOff MCP Server
(Electron, local)               (npx signoff-mcp)
Renders, organizes,             Claude Code queries
approves, git commits           approval status here
```

The vault git repo is the single source of truth. The desktop app and MCP server both read from and write to it. Reviewers access it by cloning the vault repo and opening it in the SignOff desktop app.

---

## Vault Structure

```
signoff-vault/                        # dedicated git repo per project
├── .signoff/
│   ├── config.json                   # project name, org, created date
│   └── workflows.json                # approval rules per document type
├── features/
│   ├── user-auth/
│   │   ├── spec.md
│   │   ├── spec.approval.json
│   │   ├── plan.md
│   │   └── plan.approval.json
│   └── payment-gateway/
│       ├── spec.md
│       └── spec.approval.json
└── README.md
```

Feature folder names are inferred from the source document filename (e.g. `2026-06-27-user-auth-design.md` → `user-auth`).

### Workflow Config

```json
// .signoff/workflows.json
{
  "spec": {
    "required_approvers": ["solution-architect@org.com"],
    "optional_approvers": ["product-manager@org.com"],
    "min_approvals": 1
  },
  "plan": {
    "required_approvers": ["team-lead@org.com"],
    "min_approvals": 1
  }
}
```

Reviewers are identified by their git commit email. No separate user accounts are needed.

### Approval History File

Every approval action is appended to the sidecar file — records are never overwritten. Git history provides who changed the file; the approval JSON provides why each decision was made.

```json
// features/user-auth/spec.approval.json
{
  "document": "spec.md",
  "feature": "user-auth",
  "type": "spec",
  "workflow": "spec",
  "status": "approved",
  "history": [
    {
      "action": "submitted",
      "by": "developer@org.com",
      "at": "2026-06-27T10:00:00Z",
      "message": null
    },
    {
      "action": "rejected",
      "by": "architect@org.com",
      "at": "2026-06-27T11:30:00Z",
      "message": "Missing error handling section"
    },
    {
      "action": "resubmitted",
      "by": "developer@org.com",
      "at": "2026-06-27T13:00:00Z",
      "message": "Added error handling section"
    },
    {
      "action": "approved",
      "by": "architect@org.com",
      "at": "2026-06-27T14:00:00Z",
      "message": "LGTM"
    }
  ]
}
```

---

## Multi-Vault Management

Each project has its own vault (separate git repo). SignOff manages multiple vaults via a local registry at `~/.signoff/vaults.json`. The desktop app shows a vault switcher on launch (Obsidian-style).

```
~/.signoff/vaults.json           # registry of all known vaults

~/project-alpha-vault/           # one git repo per project
~/project-beta-vault/
```

---

## Desktop App

**Tech stack:** Electron + React + TypeScript + Tailwind CSS  
**Markdown rendering:** remark + rehype pipeline (GFM, syntax highlighting)  
**Git operations:** simple-git (wraps system git)

### UI Layout

```
┌─────────────────────────────────────────────────────────┐
│ SignOff — project-alpha          [Sync] [Settings]      │
├──────────────────┬──────────────────────────────────────┤
│ FEATURES         │  user-auth / spec                    │
│                  │  ─────────────────────────────────── │
│ ▼ user-auth      │  Status: ⏳ Awaiting approval        │
│   📄 spec  ⏳    │  Submitted by: developer@org.com     │
│   📄 plan  ✅    │  Workflow: spec (1 approval required)│
│                  │                                      │
│ ▼ payment-gateway│  ── Rendered Markdown ──────────     │
│   📄 spec  ❌    │  # User Auth Spec                    │
│                  │  ...                                 │
│                  │                                      │
│                  │  ── Review History ─────────────     │
│                  │  ❌ rejected by architect — Jun 27   │
│                  │     "Missing error handling"         │
│                  │                                      │
│                  │  ┌──────────┐  ┌─────────────────┐  │
│                  │  │ Approve  │  │ Request Changes  │  │
│                  │  └──────────┘  └─────────────────┘  │
└──────────────────┴──────────────────────────────────────┘
```

**Status icons:** ⏳ pending / ✅ approved / ❌ rejected  
**Approve** — commits approval record to vault repo and pushes  
**Request Changes** — opens text field for message, commits rejection record and pushes  
**Sync** — pulls latest from vault git remote

---

## MCP Server

**Distribution:** `npm install -g signoff-mcp`  
**Runtime:** Node.js + TypeScript  

### Tools Exposed to Claude Code

```typescript
publish_document(
  source_path: string,     // absolute path to .md file in project repo
  feature_name: string,    // inferred from filename or explicitly passed
  document_type: "spec" | "plan"
) → { vault_path: string, commit_sha: string }

check_approval(
  feature_name: string,
  document_type: "spec" | "plan"
) → { status: "approved" | "pending" | "rejected" | "not_found", approved_by?: string, approved_at?: string }

list_pending() → Array<{ feature: string, type: string, submitted_at: string, submitted_by: string }>
```

### Claude Code Configuration

```json
// .claude/settings.json
{
  "mcpServers": {
    "signoff": {
      "command": "signoff-mcp",
      "args": ["--vault", "/path/to/project-vault"]
    }
  }
}
```

---

## Superpowers Skills Integration

SignOff integrates at the end of two superpowers skills and at the start of implementation skills.

**After brainstorming writes spec:**
```
→ Claude Code calls publish_document(spec.md, feature_name, "spec")
→ Surfaces message: "Spec published to SignOff. Awaiting approval from solution-architect before proceeding."
→ Halts — does not invoke writing-plans until approval is confirmed
```

**After writing-plans writes plan:**
```
→ Claude Code calls publish_document(plan.md, feature_name, "plan")
→ Surfaces message: "Plan published to SignOff. Awaiting approval from team-lead before proceeding."
→ Halts — does not invoke implementation skill until approval is confirmed
```

**Before any implementation skill runs:**
```
→ Claude Code calls check_approval(feature_name, "spec")
→ If pending/rejected: halts with reviewer name and current status
→ If approved: proceeds normally
```

**Opt-in only:** If `signoff` is not present in MCP servers config, skills behave exactly as today. Zero disruption to existing users.

---

## First-Time Setup

**Developer:**
1. Install SignOff desktop app
2. `npm install -g signoff-mcp`
3. Open SignOff → New Vault → enter project name, choose folder
4. Add MCP server to `.claude/settings.json`
5. Configure approval workflows in SignOff UI
6. Push vault repo to GitHub/GitLab (private)
7. Share vault repo URL with reviewers

**Reviewer (non-developer):**
1. Install SignOff desktop app
2. Open SignOff → Open Vault → clone from vault repo URL

---

## Monorepo Structure

```
signoff/
├── apps/
│   └── desktop/          # Electron app (React + TypeScript + Tailwind)
├── packages/
│   ├── mcp-server/       # MCP server (Node.js + TypeScript)
│   └── vault-core/       # shared git + approval logic (used by both)
└── package.json          # npm workspaces
```

`vault-core` is the single place for all approval file reading/writing and vault git operations. Both the desktop app and MCP server depend on it.

---

## Out of Scope (v1)

- Hosted/SaaS deployment (Option B — can layer on later)
- Email/Slack notifications (future)
- In-line diff view of document changes between submissions (future)
- VS Code extension (future)
