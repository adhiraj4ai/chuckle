import path from "node:path";
import {
  appendAuditEntry, resolveGitIdentity, projectRootOf, type AuditEntry,
} from "@signoff/vault-core";

/**
 * Record a successful state-changing MCP call. Fail-open: any error is swallowed
 * so audit never breaks a tool call.
 */
export async function recordMcpCall(
  vaultPath: string,
  sessionId: string,
  tool: string,
  args: unknown,
): Promise<void> {
  try {
    const feature =
      typeof args === "object" && args !== null &&
      typeof (args as Record<string, unknown>).feature_name === "string"
        ? ((args as Record<string, unknown>).feature_name as string)
        : null;
    // Resolve identity against the PROJECT repo, not the vault (.signoff) repo:
    // the vault is its own git repo with no local user identity, so resolving
    // there falls through to the global config, which can differ from the
    // project-local identity the gate recorder uses. Resolving both against the
    // project root keeps one person's gate rows and MCP rows under one actor.
    const projectRoot = projectRootOf(vaultPath);
    const identity = await resolveGitIdentity(projectRoot);
    const entry: AuditEntry = {
      v: 1,
      session_id: sessionId,
      ts: new Date().toISOString(),
      actor: identity?.email ?? "unknown",
      feature,
      repo: path.basename(projectRoot),
      source: "mcp",
      tool,
      decision: "allow",
    };
    await appendAuditEntry(vaultPath, entry);
  } catch {
    /* fail-open */
  }
}
