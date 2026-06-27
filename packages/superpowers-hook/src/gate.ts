import path from "node:path";
import {
  getApprovalStatus, readActiveFeature, readWorkflows, getWorkflowForType,
  readManifest, getFeatureDoc, manifestFeatureNames, type DocumentType,
} from "@chuckle/vault-core";
import fs from "node:fs/promises";
import type { PreToolUseEvent, GateDecision } from "./types.js";

const CHUCKLE_DIR = ".signoff";

function isUnder(rel: string, base: string): boolean {
  return rel === base || rel.startsWith(base + "/");
}
function targetPath(event: PreToolUseEvent): string | null {
  return event.tool_input.file_path ?? event.tool_input.notebook_path ?? null;
}
function classifyDoc(rel: string): DocumentType {
  const p = rel.toLowerCase();
  if (/(^|\/)plans?(\/|$)/.test(p) || /plan/.test(path.basename(p))) return "plan";
  return "spec";
}
async function readDocRoots(vaultPath: string): Promise<string[]> {
  try {
    const cfg = JSON.parse(await fs.readFile(path.join(vaultPath, "config.json"), "utf-8"));
    if (Array.isArray(cfg.doc_roots) && cfg.doc_roots.length) return cfg.doc_roots;
  } catch { /* default */ }
  return ["docs", ".superpowers"];
}

export async function evaluateGate(event: PreToolUseEvent): Promise<GateDecision> {
  try {
    const target = targetPath(event);
    if (!target) return { allow: true };

    const vaultPath = path.join(event.cwd, CHUCKLE_DIR);
    const rel = path.relative(event.cwd, path.resolve(event.cwd, target)).split(path.sep).join("/");

    if (isUnder(rel, CHUCKLE_DIR)) return { allow: true };

    const [manifest, docRoots] = await Promise.all([readManifest(vaultPath), readDocRoots(vaultPath)]);

    // Find a feature whose registered plan/spec path equals rel.
    const featureFor = (type: DocumentType): string | null =>
      manifestFeatureNames(manifest).find((f) => getFeatureDoc(manifest, f, type) === rel) ?? null;

    const underDocRoot = docRoots.some((r) => isUnder(rel, r));

    // Spec authoring is the entry point: registered spec OR a new spec-classified file under a doc root.
    if (featureFor("spec") || (underDocRoot && classifyDoc(rel) === "spec")) return { allow: true };

    // Registered plan doc → gate on that feature's spec approval.
    const planFeature = featureFor("plan");
    if (planFeature) {
      const status = await getApprovalStatus(vaultPath, planFeature, "spec");
      if (status.status === "approved") return { allow: true };
      return { allow: false, reason: `🔒 Signoff: plan authoring for "${planFeature}" is gated on spec approval (spec status: ${status.status}).` };
    }

    // A new plan-classified file under a doc root with no registration yet → allow authoring
    // (it becomes registered on submit; spec-gating applies once registered).
    if (underDocRoot && classifyDoc(rel) === "plan") return { allow: true };

    // Otherwise this is code: gate on the active feature's plan approval.
    const pointer = await readActiveFeature(event.cwd);
    if (!pointer) {
      return { allow: false, reason: "🔒 Signoff: no active feature. Submit a spec first before making code changes." };
    }
    const status = await getApprovalStatus(pointer.vaultPath, pointer.feature, "plan");
    if (status.status === "approved") return { allow: true };

    let who = "";
    try {
      const wf = getWorkflowForType(await readWorkflows(pointer.vaultPath), "plan");
      if (wf.required_approvers.length) who = `\nAwaiting approval from: ${wf.required_approvers.join(", ")}`;
    } catch { /* decorative only */ }
    return { allow: false, reason: `🔒 Signoff: code changes are gated.\nFeature "${pointer.feature}" — plan status: ${status.status}.${who}` };
  } catch (err) {
    return { allow: false, reason: `🔒 Signoff: approval gate could not verify status (${err instanceof Error ? err.message : String(err)}). Blocking by default.` };
  }
}
