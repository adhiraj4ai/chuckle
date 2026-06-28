# SignOff — Project Instructions

## What this project is

SignOff is an open source markdown document review and approval platform for AI-assisted vibe coding. It gates spec and plan documents behind a human approval workflow before Claude Code is allowed to proceed with implementation.

Three components:
- `packages/vault-core/` — shared git + approval logic (Node.js + TypeScript)
- `packages/mcp-server/` — MCP server exposing `publish_document`, `check_approval`, `list_pending` to Claude Code
- `apps/desktop/` — Electron + React + TypeScript vault UI for reviewers

## Critical constraints

- **No Claude/Anthropic commit signatures.** All git commits must use the human user's git identity resolved from system git config. Never hardcode author names or emails.
- **No `dist/` committed.** Build output is gitignored in every package.
- **`docs/superpowers/` is gitignored.** Specs and plans written by superpowers skills are local only — never committed to the project repo.

## Monorepo conventions

- npm workspaces: `packages/*` and `apps/*`
- ESM throughout — all imports end in `.js`, `"type": "module"` in every package.json
- TypeScript strict mode, `moduleResolution: NodeNext`
- Vitest for all tests — real vaults created with `VaultManager.create()` in temp dirs; no mocks of vault-core internals
- `CHUCKLE_HOME` env var overrides `~/.chuckle` for test isolation

## Design spec and plans

- Design spec: `docs/superpowers/specs/2026-06-27-chuckle-design.md`
- Plan 1 (vault-core, done): `docs/superpowers/plans/2026-06-27-vault-core.md`
- Plan 2 (mcp-server, next): `docs/superpowers/plans/2026-06-27-mcp-server.md`
- Plan 3 (desktop app, pending): not yet written
- Plan 4 (superpowers hooks, pending): not yet written

## GitHub

Repository: https://github.com/adhiraj4ai/signoff

## Key vault-core API

```typescript
// VaultManager
VaultManager.create(vaultPath, name, org)  // initializes vault + git repo
VaultManager.open(vaultPath)               // opens existing vault
vault.publish(sourcePath, featureName, type, authorEmail, authorName)  // → PublishResult

// Approval
getApprovalStatus(vaultPath, feature, type)  // → CheckApprovalResult
readApproval(vaultPath, feature, type)       // → ApprovalRecord | null
writeApproval(vaultPath, record)
appendHistory(record, entry)                 // → updated ApprovalRecord

// Feature inference
inferFeatureName("2026-06-27-user-auth-design.md")  // → "user-auth"
```
