export interface PreToolUseEvent {
  cwd: string;
  tool_name: string;
  tool_input: {
    file_path?: string;
    notebook_path?: string;
    [key: string]: unknown;
  };
  session_id?: string;   // Claude Code sends this on stdin; used to group audit entries
}

export interface GateDecision {
  allow: boolean;
  reason?: string;
  feature?: string | null;   // feature the decision pertains to (for audit)
}
