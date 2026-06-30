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

## Rules

- **If the hook blocks an edit, publish the relevant document and hand off.**
  Never retry the edit, and never use Bash to write a file the hook would
  block — that defeats the gate the human relies on.
- One feature at a time. Use a stable `feature_name` slug (e.g. `user-auth`)
  across spec, plan, and implementation.
- The human approves in the SignOff desktop app; approvals sync over git, so
  there may be a short delay before `check_approval` reflects them.
