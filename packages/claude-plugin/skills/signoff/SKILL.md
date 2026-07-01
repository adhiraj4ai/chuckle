---
name: signoff-workflow
description: Use when implementing a feature in a project that has a .signoff vault. Gates implementation behind human approval — publish the spec, then the plan, and stop for review between each. Triggers on requests to build, implement, or change code in a SignOff-enabled project.
---

# SignOff workflow

This project gates code changes behind human approval. A PreToolUse hook
blocks edits until the right document is approved. Your job is to move the
work through the gate cleanly — never to route around it.

## The loop

1. **Spec.** Write the spec to the project's docs root (e.g. `docs/`). Then
   call `publish_document(document_path, feature_name, "spec")`. Tell the
   human: "Submitted the **<feature>** spec for approval — review it in
   SignOff." Then **stop** and wait for a new prompt.

2. **Plan.** When prompted again, call `check_approval(feature_name, "spec")`.
   - If `approved`: write the plan, call
     `publish_document(document_path, feature_name, "plan")`, tell the human
     it's submitted, and **stop**.
   - If not approved: report the status and **stop**. Do not start the plan.

3. **Implement.** When prompted again, call `check_approval(feature_name, "plan")`.
   - If `approved`: implement. The hook now allows edits.
   - If not approved: report the status and **stop**.

## Decision records (ADR)

When you make a non-obvious design decision during spec/plan work — a choice
with real alternatives (a library, a data model, a tradeoff) — record it:

1. Write or append the feature's ADR at `docs/adr/<feature>-adr.md` (one ADR
   doc per feature; add each decision as a dated `## <decision>` section).
2. Call `publish_document(document_path, feature_name, "adr")`.
3. On a later decision, edit the same ADR doc and re-publish — re-publishing
   re-opens approval so reviewers see it changed.

The ADR records *why*; it complements (does not replace) the spec/plan. An ADR
is **non-blocking** — a pending or absent ADR never blocks code, so write and
publish it in parallel with the normal spec → plan → implement flow. Do not
wait on ADR approval to proceed.

## Diagrams

Some projects require a **diagram** before a spec or plan can be approved (a
per-workflow "require a diagram" setting). When you write a spec or plan, include
an architecture diagram as a fenced ` ```mermaid ` block (preferred — versionable
and diffable) or an embedded image `![alt](path)`. If `check_approval` keeps
returning a non-approved status with `missing_diagram: true`, the document has no
diagram yet — add one and re-publish. A missing diagram never blocks *authoring*;
it only holds back approval.

## Tickets

If the work traces to an external tracker item (Jira, GitHub, Linear), pass it
when you publish: `publish_document(path, feature, "spec", ticket_id="PROJ-123",
ticket_url="https://…")`. The link is optional and never blocks approval; the
reviewer can add or change it in the SignOff app. Only http(s) URLs are kept.

## Rules

- **If the hook blocks an edit, publish the relevant document and hand off.**
  Never retry the edit, and never use Bash to write a file the hook would
  block — that defeats the gate the human relies on.
- One feature at a time. Use a stable `feature_name` slug (e.g. `user-auth`)
  across spec, plan, and implementation.
- The human approves in the SignOff desktop app; approvals sync over git, so
  there may be a short delay before `check_approval` reflects them.
