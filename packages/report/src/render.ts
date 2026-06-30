import type { Report, DocStatus } from "./collect.js";

const STATUS_ORDER: DocStatus[] = ["approved", "in_review", "pending", "rejected", "not_found"];
const STATUS_LABEL: Record<DocStatus, string> = {
  approved: "approved", in_review: "in_review", pending: "pending", rejected: "rejected", not_found: "none",
};

function pct(n: number, d: number): string {
  return d === 0 ? "0/0 (0%)" : `${n}/${d} (${Math.round((n / d) * 100)}%)`;
}

function mdCell(status: DocStatus, stale: boolean): string {
  if (status === "not_found") return "—";
  return stale ? `${status} (stale)` : status;
}

export function renderMarkdown(report: Report): string {
  const t = report.totals;
  const byStatus = STATUS_ORDER.map((s) => `${STATUS_LABEL[s]} ${t.byStatus[s]}`).join(" · ");
  return [
    "# SignOff approval report",
    "",
    `- Features: ${t.features}`,
    `- Approved spec: ${pct(t.approvedSpec, t.features)}`,
    `- Approved plan: ${pct(t.approvedPlan, t.features)}`,
    `- Stale approvals: ${t.stale}`,
    `- By status (spec+plan docs): ${byStatus}`,
    "",
    "| Feature | Spec | Plan |",
    "|---|---|---|",
    ...report.features.map((f) => `| ${f.name} | ${mdCell(f.spec, f.specStale)} | ${mdCell(f.plan, f.planStale)} |`),
    "",
  ].join("\n");
}

function csvCell(status: DocStatus): string {
  return status === "not_found" ? "" : status;
}

export function renderCsv(report: Report): string {
  const rows = ["feature,spec,plan,spec_stale,plan_stale"];
  for (const f of report.features) {
    rows.push([f.name, csvCell(f.spec), csvCell(f.plan), String(f.specStale), String(f.planStale)].join(","));
  }
  return rows.join("\n") + "\n";
}
