import path from "node:path";
import {
  getApprovalStatus, isClearedForCode, readActiveFeature, readWorkflows, getWorkflowForType,
  readManifest, getFeatureDoc, manifestFeatureNames, type DocumentType,
} from "@signoff/vault-core";
import fs from "node:fs/promises";
import type { PreToolUseEvent, GateDecision } from "./types.js";

const SIGNOFF_DIR = ".signoff";

function isUnder(rel: string, base: string): boolean {
  return rel === base || rel.startsWith(base + "/");
}
function targetPath(event: PreToolUseEvent): string | null {
  return event.tool_input.file_path ?? event.tool_input.notebook_path ?? null;
}
function classifyDoc(rel: string): DocumentType {
  const p = rel.toLowerCase();
  const base = path.basename(p);
  if (/(^|\/)adrs?(\/|$)/.test(p) || /(^|-)adrs?\.md$/.test(base) || base.includes("decision-record")) {
    return "adr";
  }
  if (/(^|\/)plans?(\/|$)/.test(p) || /plan/.test(path.basename(p))) return "plan";
  return "spec";
}
/** Only markdown files qualify for the "spec/plan authoring under a doc root" free pass. */
function isMarkdown(rel: string): boolean {
  return rel.toLowerCase().endsWith(".md");
}
async function readDocRoots(vaultPath: string): Promise<string[]> {
  try {
    const cfg = JSON.parse(await fs.readFile(path.join(vaultPath, "config.json"), "utf-8"));
    if (Array.isArray(cfg.doc_roots) && cfg.doc_roots.length) return cfg.doc_roots;
  } catch { /* default */ }
  return ["docs"];
}

export async function evaluateGate(event: PreToolUseEvent): Promise<GateDecision> {
  try {
    const target = targetPath(event);
    if (!target) return { allow: true };

    const vaultPath = path.join(event.cwd, SIGNOFF_DIR);
    const rel = path.relative(event.cwd, path.resolve(event.cwd, target)).split(path.sep).join("/");

    if (isUnder(rel, SIGNOFF_DIR)) return { allow: true };

    const [manifest, docRoots] = await Promise.all([readManifest(vaultPath), readDocRoots(vaultPath)]);

    // Find a feature whose registered plan/spec path equals rel.
    const featureFor = (type: DocumentType): string | null =>
      manifestFeatureNames(manifest).find((f) => getFeatureDoc(manifest, f, type) === rel) ?? null;

    const underDocRoot = docRoots.some((r) => isUnder(rel, r));

    // Spec authoring is the entry point: registered spec OR a new spec-classified
    // MARKDOWN file under a doc root. Non-.md files (e.g. docs/app.ts) do NOT get
    // this free pass — they fall through to the code-gating path below.
    if (featureFor("spec") || (underDocRoot && isMarkdown(rel) && classifyDoc(rel) === "spec")) return { allow: true };

    // ADR is a non-gating record: authoring/editing it is always allowed.
    if (featureFor("adr") || (underDocRoot && isMarkdown(rel) && classifyDoc(rel) === "adr")) {
      return { allow: true };
    }

    // Registered plan doc → gate on that feature's spec approval.
    const planFeature = featureFor("plan");
    if (planFeature) {
      const status = await getApprovalStatus(vaultPath, planFeature, "spec");
      if (status.status === "approved") return { allow: true };
      return { allow: false, reason: `🔒 Signoff: plan authoring for "${planFeature}" is gated on spec approval (spec status: ${status.status}).` };
    }

    // A new plan-classified MARKDOWN file under a doc root with no registration yet → allow authoring
    // (it becomes registered on submit; spec-gating applies once registered).
    if (underDocRoot && isMarkdown(rel) && classifyDoc(rel) === "plan") return { allow: true };

    // Otherwise this is code: gate on the active feature via tier-aware isClearedForCode.
    const pointer = await readActiveFeature(event.cwd);
    if (!pointer) {
      return { allow: false, reason: "🔒 Signoff: no active feature. Submit a spec first before making code changes." };
    }
    const clearance = await isClearedForCode(pointer.vaultPath, pointer.feature);
    if (clearance.cleared) return { allow: true };

    let who = "";
    try {
      const wf = getWorkflowForType(await readWorkflows(pointer.vaultPath), clearance.artifact);
      if (wf.required_approvers.length) who = `\nAwaiting approval from: ${wf.required_approvers.join(", ")}`;
    } catch { /* decorative only */ }
    return {
      allow: false,
      reason: `🔒 Signoff: code changes are gated.\nFeature "${pointer.feature}" (${clearance.tier}) — ${clearance.artifact} status: ${clearance.status}.${who}`,
    };
  } catch (err) {
    return { allow: false, reason: `🔒 Signoff: approval gate could not verify status (${err instanceof Error ? err.message : String(err)}). Blocking by default.` };
  }
}
