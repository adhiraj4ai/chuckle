#!/usr/bin/env node
import { evaluateGate } from "./gate.js";
import { recordGateDecision } from "./recorder.js";
import type { PreToolUseEvent } from "./types.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function main(): Promise<void> {
  let event: PreToolUseEvent;
  try {
    const raw = await readStdin();
    event = JSON.parse(raw) as PreToolUseEvent;
  } catch {
    // Fail closed: unreadable/malformed event blocks the tool call.
    process.stderr.write("🔒 SignOff: could not parse hook event. Blocking by default.\n");
    process.exit(2);
    return;
  }

  const decision = await evaluateGate(event);
  // Fail-open: audit recording can never change the gate outcome.
  try {
    await recordGateDecision(event, decision);
  } catch {
    /* swallow — the exit code below is decided solely by decision.allow */
  }
  if (decision.allow) {
    process.exit(0);
  }
  process.stderr.write((decision.reason ?? "🔒 SignOff: blocked.") + "\n");
  process.exit(2);
}

void main().catch(() => {
  process.stderr.write("🔒 SignOff: unexpected error. Blocking by default.\n");
  process.exit(2);
});
