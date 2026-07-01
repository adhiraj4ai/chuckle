import fs from "node:fs/promises";
import {
  readManifest, manifestFeatureNames, getApprovalStatus, readApproval,
  resolveDocPath, hashContent, isStale,
  type ApprovalStatus, type DocumentType, type Manifest,
} from "@signoff/vault-core";

export type DocStatus = ApprovalStatus | "not_found";

export interface FeatureReport {
  name: string;
  spec: DocStatus;
  plan: DocStatus;
  specStale: boolean;
  planStale: boolean;
}

export interface ReportTotals {
  features: number;
  approvedSpec: number;
  approvedPlan: number;
  byStatus: Record<DocStatus, number>;
  stale: number;
}

export interface Report {
  totals: ReportTotals;
  features: FeatureReport[];
}

const TYPES: DocumentType[] = ["spec", "plan"];

/** True when an approval exists for this doc and the doc has changed since
 *  (vault-core isStale). Any read error ⇒ false (never crash a report). */
async function docStale(vaultPath: string, manifest: Manifest, feature: string, type: DocumentType): Promise<boolean> {
  try {
    const record = await readApproval(vaultPath, feature, type);
    if (!record) return false;
    const abs = resolveDocPath(vaultPath, manifest, feature, type);
    if (!abs) return false;
    return isStale(record, hashContent(await fs.readFile(abs)));
  } catch {
    return false;
  }
}

export async function collectReport(vaultPath: string): Promise<Report> {
  const manifest = await readManifest(vaultPath);
  const names = manifestFeatureNames(manifest);
  const byStatus: Record<DocStatus, number> = {
    approved: 0, in_review: 0, pending: 0, rejected: 0, not_found: 0,
  };
  const features: FeatureReport[] = [];
  let approvedSpec = 0, approvedPlan = 0, stale = 0;

  for (const name of names) {
    // adr keys satisfy Record<DocumentType,…>; TYPES (spec/plan only) drives the
    // loop, so adr is never collected or surfaced — ADR stays out of report coverage.
    const status: Record<DocumentType, DocStatus> = { spec: "not_found", plan: "not_found", adr: "not_found" };
    const staleFlag: Record<DocumentType, boolean> = { spec: false, plan: false, adr: false };
    for (const type of TYPES) {
      try {
        status[type] = (await getApprovalStatus(vaultPath, name, type)).status;
      } catch {
        status[type] = "not_found";
      }
      byStatus[status[type]] = (byStatus[status[type]] ?? 0) + 1;
      staleFlag[type] = await docStale(vaultPath, manifest, name, type);
      if (staleFlag[type]) stale++;
    }
    if (status.spec === "approved") approvedSpec++;
    if (status.plan === "approved") approvedPlan++;
    features.push({ name, spec: status.spec, plan: status.plan, specStale: staleFlag.spec, planStale: staleFlag.plan });
  }

  return { totals: { features: names.length, approvedSpec, approvedPlan, byStatus, stale }, features };
}
