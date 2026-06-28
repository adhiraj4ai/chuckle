# SignOff + Superpowers integration

SignOff gates implementation behind human approval of spec/plan documents.
Integration is **opt-in**: with no `signoff` MCP server and no `signoff-gate`
hook in `.claude/settings.json`, your skills behave exactly as before.

## Setup

1. `npm install -g @signoff/mcp-server @signoff/superpowers-hook`
2. Create a vault in the SignOff desktop app and note its absolute path.
3. Add both the MCP server and the hook to your project's
   `.claude/settings.json` (see `docs/signoff-settings-example.json`).

## How it works

- **The hook (`signoff-gate`)** is the hard gate. On every `Write`/`Edit`/
  `MultiEdit`/`NotebookEdit` it checks the active feature's approval status:
  - writes under `docs/superpowers/specs/` — always allowed
  - writes under `docs/superpowers/plans/` — require the spec to be **approved**
  - any other file (code, tests, config) — require the plan to be **approved**
  - no active feature published yet — blocked
- **The publish convention** is how Claude tells SignOff which feature is
  active. After brainstorming writes a spec, call
  `publish_document(source_path, feature_name, "spec")`. After writing-plans
  writes a plan, call `publish_document(source_path, feature_name, "plan")`.
  Publishing writes `.signoff/active-feature.json` in your project, which the
  hook reads.

If Claude forgets to publish, the hook still blocks code changes — publishing
smooths the workflow, the hook provides the guarantee.

## Known limitation (v1)

The hook gates the structured edit tools. A write performed through `Bash`
(e.g. `echo > foo.ts`) is not gated in v1.
