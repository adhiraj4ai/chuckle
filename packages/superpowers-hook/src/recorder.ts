import path from "node:path";
import {
  appendAuditEntry, resolveGitIdentity, readActiveFeature, type AuditEntry,
} from "@signoff/vault-core";
import type { PreToolUseEvent, GateDecision } from "./types.js";

/**
 * Append a gate decision to the audit log. Fail-open: the caller wraps this in
 * try/catch, but we also resolve inputs defensively so a partial failure yields
 * a best-effort entry rather than throwing before the append. appendAuditEntry
 * itself may throw on I/O failure, so the append is wrapped here too — this
 * function must never throw regardless of caller.
 */
export async function recordGateDecision(
  event: PreToolUseEvent,
  decision: GateDecision,
): Promise<void> {
  try {
    const pointer = await readActiveFeature(event.cwd).catch(() => null);
    const vaultPath = pointer?.vaultPath ?? path.join(event.cwd, ".signoff");
    const identity = await resolveGitIdentity(event.cwd);
    const entry: AuditEntry = {
      v: 1,
      session_id: event.session_id ?? null,
      ts: new Date().toISOString(),
      actor: identity?.email ?? "unknown",
      feature: decision.feature ?? pointer?.feature ?? null,
      repo: path.basename(event.cwd),
      source: "gate",
      tool: event.tool_name,
      decision: decision.allow ? "allow" : "block",
    };
    await appendAuditEntry(vaultPath, entry);
  } catch {
    /* fail-open: audit recording must never throw or affect the gate outcome */
  }
}
