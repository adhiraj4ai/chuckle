# SignOff

**A markdown document review and approval platform for AI-assisted "vibe coding."**

SignOff puts a human approval gate in front of spec and plan documents, so an AI agent (e.g. Claude Code) can't start implementing until a human reviewer has signed off. The agent publishes a spec, a person reviews and approves it, and only then is the agent cleared to write code. Everything syncs over plain git — there's no backend to run.

> Repository: [`adhiraj4ai/signoff`](https://github.com/adhiraj4ai/signoff) · the product is **SignOff**.

---

## Why

AI coding agents are fast and eager — they'll happily implement a half-baked spec. SignOff inserts a deliberate human checkpoint: specs and plans land in a **vault** (a git repo), a reviewer approves or requests changes in a desktop app, and the agent is gated on the result. Approvals are committed under the **human reviewer's git identity** — no bot signatures.

## How it works

```
   Claude Code                  SignOff vault (git)              Reviewer
  ┌───────────┐   publish_document   ┌─────────────┐   pull/review   ┌──────────────┐
  │  agent    │ ───────────────────▶ │   spec.md   │ ──────────────▶ │ desktop app  │
  │           │                      │  approval   │                 │ approve /    │
  │           │ ◀─────────────────── │   record    │ ◀────────────── │ request      │
  └───────────┘    check_approval    └─────────────┘     commit      └──────────────┘
        │                                                                    
        └── gated: implementation proceeds only once approved ──┘
```

1. The agent calls **`publish_document`** to push a spec/plan into the vault.
2. The reviewer pulls it into the **SignOff desktop app**, reads it, comments, and **approves** or **requests changes**.
3. The agent calls **`check_approval`** before implementing — and only proceeds once the document is signed off.

## Components

This is an npm-workspaces monorepo with three pieces:

| Package | What it does |
|---|---|
| [`packages/vault-core`](packages/vault-core) | Shared engine — git operations and the approval state machine. Create/open vaults, publish documents, read/write approval records with full history. Transactional and conflict-safe. |
| [`packages/mcp-server`](packages/mcp-server) | MCP server exposing three tools to Claude Code: **`publish_document`**, **`check_approval`**, **`list_pending`**. |
| [`apps/desktop`](apps/desktop) | Electron + React review app for humans — review workflow, threaded discussion, git sync, multi-vault switching, and rich markdown (Mermaid, KaTeX, syntax highlighting) with light/dark themes. |

### Turn on the gate in Claude Code

Install the plugin (ships the hook + MCP server + workflow skill):

```bash
claude plugin marketplace add adhiraj4ai/signoff
claude plugin install signoff@signoff --scope project
```

The plugin invokes `@signoff/mcp-server` and `@signoff/superpowers-hook` via
`npx`, so those packages must be available from npm.

Or click **Connect to Claude Code** in the desktop app's status bar. See
[`docs/superpowers-integration.md`](docs/superpowers-integration.md).

## Install

Download the latest installer from the [**Releases**](https://github.com/adhiraj4ai/signoff/releases) page:

| Platform | File |
|---|---|
| **macOS** (Apple Silicon) | `SignOff-<version>-arm64.dmg` |
| **Windows** (x64) | `SignOff-Setup-<version>.exe` |
| **Linux** (x64) | `SignOff-<version>.AppImage` or `SignOff_<version>_amd64.deb` |

> Builds are not yet code-signed. On macOS, right-click → **Open** the first time. On Windows, click **More info → Run anyway** past SmartScreen.

## Develop

Requires **Node.js ≥ 20**.

```bash
git clone https://github.com/adhiraj4ai/signoff.git
cd signoff
npm install
npm run build          # build all workspaces

# run the desktop app in dev mode
npm run dev -w @signoff/desktop

# run the test suites
npm test
```

### Build installers

```bash
# from apps/desktop
npm run build                                   # bundle main + renderer
npx electron-builder@26 --mac dmg               # macOS (run on macOS)
npx electron-builder@26 --win nsis              # Windows (needs Wine on non-Windows)
npx electron-builder@26 --linux AppImage deb    # Linux
```

Windows and Linux installers can be cross-built from macOS using the
[`electronuserland/builder:wine`](https://hub.docker.com/r/electronuserland/builder) Docker image.

## Project structure

```
signoff/
├── packages/
│   ├── vault-core/     # git + approval logic (TypeScript)
│   └── mcp-server/     # MCP server for Claude Code
├── apps/
│   └── desktop/        # Electron + React reviewer app
└── docs/               # design specs and plans
```

## Conventions

- **ESM throughout**, TypeScript strict mode, `NodeNext` module resolution.
- **Vitest** for tests — real vaults created in temp dirs, no mocking of vault-core internals.
- Commits use the **human user's git identity** resolved from system git config — never bot signatures.

## Status

Early `0.1.0` — the full pipeline works end to end, but expect rough edges and breaking changes before `1.0`.
