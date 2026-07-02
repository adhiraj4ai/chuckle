import fs from "node:fs/promises";
import path from "node:path";

export type AuditSource = "gate" | "mcp";
export type AuditDecision = "allow" | "block";

export interface AuditEntry {
  v: 1;
  session_id: string | null;
  ts: string;                 // ISO 8601 UTC
  actor: string;              // git email, or "unknown"
  feature: string | null;
  repo: string;
  source: AuditSource;
  tool: string;
  decision: AuditDecision;
}

export interface ReadAuditOptions {
  feature?: string;
}

export function auditDirPath(vaultPath: string): string {
  return path.join(vaultPath, "audit");
}

export function actorSlug(actor: string): string {
  const s = actor.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s.length ? s : "unknown";
}

export function auditRelPathFor(actor: string, dateUtc: string): string {
  return `audit/${actorSlug(actor)}-${dateUtc}.jsonl`;
}

/** Append one metadata entry. May throw on I/O failure — callers wrap fail-open. */
export async function appendAuditEntry(vaultPath: string, entry: AuditEntry): Promise<void> {
  if (entry.v !== 1) throw new Error(`unsupported audit entry version: ${String(entry.v)}`);
  const day = entry.ts.slice(0, 10); // YYYY-MM-DD from an ISO-8601 UTC timestamp
  const abs = path.join(vaultPath, auditRelPathFor(entry.actor, day));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.appendFile(abs, JSON.stringify(entry) + "\n", "utf-8");
}

/** Read all entries, newest-first, tolerant of malformed lines. */
export async function readAuditEntries(
  vaultPath: string,
  opts: ReadAuditOptions = {},
): Promise<AuditEntry[]> {
  const dir = auditDirPath(vaultPath);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: AuditEntry[] = [];
  for (const f of files) {
    if (!f.endsWith(".jsonl")) continue;
    let raw: string;
    try {
      raw = await fs.readFile(path.join(dir, f), "utf-8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      let e: AuditEntry;
      try {
        e = JSON.parse(t) as AuditEntry;
      } catch {
        continue;
      }
      if (opts.feature && e.feature !== opts.feature) continue;
      out.push(e);
    }
  }
  out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return out;
}

/** Relative paths of all audit files, for stageAndCommit. */
export async function auditRelPaths(vaultPath: string): Promise<string[]> {
  const dir = auditDirPath(vaultPath);
  try {
    const files = await fs.readdir(dir);
    return files.filter((f) => f.endsWith(".jsonl")).sort().map((f) => `audit/${f}`);
  } catch {
    return [];
  }
}
