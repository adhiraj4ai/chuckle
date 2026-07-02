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
    const identity = await resolveGitIdentity(vaultPath);
    const entry: AuditEntry = {
      v: 1,
      session_id: sessionId,
      ts: new Date().toISOString(),
      actor: identity?.email ?? "unknown",
      feature,
      repo: path.basename(projectRootOf(vaultPath)),
      source: "mcp",
      tool,
      decision: "allow",
    };
    await appendAuditEntry(vaultPath, entry);
  } catch {
    /* fail-open */
  }
}
