# 2. Getting started

This chapter walks you through installing the SignOff desktop app, initializing a vault for your project, and wiring up the gate in Claude Code.

## Prerequisites

- **Node.js ≥ 20** — required for the plugin and hook packages.
- **Git** — the vault is a git repo. Git must be on your PATH and configured with a user name and email (`git config --global user.name` / `git config --global user.email`).
- **Claude Code** — to use the gate in an AI-assisted workflow. Not required if you only want to review documents.

## Install the desktop app

Download the latest installer from the [Releases](https://github.com/adhiraj4ai/signoff/releases) page:

| Platform | File |
|---|---|
| macOS (Apple Silicon) | `SignOff-<version>-arm64.dmg` |
| Windows (x64) | `SignOff-Setup-<version>.exe` |
| Linux (x64) | `SignOff-<version>.AppImage` or `SignOff_<version>_amd64.deb` |

> Note: Builds are not yet code-signed. On macOS, right-click → **Open** the first time. On Windows, click **More info → Run anyway** past SmartScreen.

## Initialize or open a vault

A vault is created once per project. If you are the first person setting up SignOff for a project, you initialize a new vault. If a `.signoff` directory already exists in your project, you open the existing one.

### Initialize a new vault

1. Open the SignOff desktop app.
2. Click **Add vault** (or open the vault picker from the sidebar).
3. Select your project's root directory. The app creates `.signoff/` inside it, initializes a git repo there, and writes the default `config.json` and `workflows.json`.

The `.signoff` directory is safe to commit to your project repo. Add the remote you want approvals to sync over:

```bash
cd <project>/.signoff
git remote add origin <your-vault-remote-url>
git push -u origin main
```

Your team members open the vault by pointing the desktop app at the same `.signoff` directory (or by cloning the vault remote first).

### Open an existing vault

1. Open the SignOff desktop app.
2. Click **Add vault** and select the `.signoff` directory inside the project.

The app registers the vault in the **registry** at `~/.signoff` (overridable with `SIGNOFF_HOME`). The registry tracks which vaults the desktop app knows about — it is separate from the vault itself.

### What gets created

After initialization, `.signoff/` contains:

```
.signoff/
├── config.json        # vault name and doc_roots (defaults to ["docs"])
├── workflows.json     # per-type approval rules
├── index.json         # feature manifest (version 2)
└── README.md          # auto-generated metadata
```

Approval records are added to `.signoff/approvals/` as documents are published.

## Turn on the gate in Claude Code

There are two ways to wire up the gate. Both install the same underlying packages — `@signoff/mcp-server` (the MCP server) and `@signoff/superpowers-hook` (the `signoff-gate` PreToolUse hook) — via `npx`.

### Option A: install the plugin from the marketplace

Run these two commands from your project directory:

```bash
claude plugin marketplace add adhiraj4ai/signoff
claude plugin install signoff@signoff --scope project
```

The first command fetches the plugin definition from the marketplace. The second installs it scoped to the current project, which writes the MCP server config and the PreToolUse hook to your project's Claude Code settings. The plugin invokes `@signoff/mcp-server` (bin: `signoff-mcp`) and `@signoff/superpowers-hook` (bin: `signoff-gate`) via `npx`, so those packages must be available from npm.

### Option B: use the desktop app

1. Open your project's vault in the SignOff desktop app.
2. Click **Connect to Claude Code** in the status bar at the bottom of the window.

This performs the same configuration as Option A — it writes the MCP server and hook entries to your project's Claude Code settings — without requiring you to run CLI commands.

### What gets configured

Either option registers two things with Claude Code:

- **MCP server** — `@signoff/mcp-server` (`signoff-mcp`). Exposes `publish_document`, `check_approval`, and `list_pending` to the agent.
- **PreToolUse hook** — `@signoff/superpowers-hook` (`signoff-gate`). Intercepts every file-write tool call and blocks it if the feature's gating document is not approved.

## The SIGNOFF_HOME variable

By default, the vault registry lives at `~/.signoff`. Set `SIGNOFF_HOME` to override this — useful if you need an isolated registry for testing or for a separate home directory:

```bash
export SIGNOFF_HOME=/path/to/custom-registry
```

This variable affects both the desktop app and the CLI tools. It does not change where the project vault lives (`.signoff` is always inside your project).

## You're ready

Once the vault is initialized and the gate is wired up, you and Claude Code can start the spec → plan → implement loop. Head to [The core workflow](03-core-workflow.md) to walk through it step by step.

## See also

- [Introduction](01-introduction.md)
- [The core workflow](03-core-workflow.md)
