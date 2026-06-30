import { describe, it, expect } from "vitest";
import { renderMarkdown, renderCsv } from "../src/render.js";
import type { Report } from "../src/collect.js";

const report: Report = {
  totals: { features: 2, approvedSpec: 1, approvedPlan: 0,
    byStatus: { approved: 1, in_review: 0, pending: 1, rejected: 0, not_found: 2 }, stale: 1 },
  features: [
    { name: "alpha", spec: "approved", plan: "pending", specStale: false, planStale: false },
    { name: "beta", spec: "approved", plan: "not_found", specStale: true, planStale: false },
  ],
};

describe("renderMarkdown", () => {
  it("shows coverage with percentages, by-status, stale annotation, and — for none", () => {
    const md = renderMarkdown(report);
    expect(md).toContain("Approved spec: 1/2 (50%)");
    expect(md).toContain("Approved plan: 0/2 (0%)");
    expect(md).toContain("Stale approvals: 1");
    expect(md).toContain("none 2");
    expect(md).toContain("approved (stale)");
    expect(md).toContain("| beta | approved (stale) | — |");
  });
  it("0 features → 0/0 (0%) with no NaN", () => {
    const empty: Report = { totals: { features: 0, approvedSpec: 0, approvedPlan: 0, byStatus: { approved: 0, in_review: 0, pending: 0, rejected: 0, not_found: 0 }, stale: 0 }, features: [] };
    const md = renderMarkdown(empty);
    expect(md).toContain("Approved spec: 0/0 (0%)");
    expect(md).not.toContain("NaN");
  });
});

describe("renderCsv", () => {
  it("emits a header + one row per feature; not_found → empty cell; booleans lowercase", () => {
    const csv = renderCsv(report);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("feature,spec,plan,spec_stale,plan_stale");
    expect(lines).toContain("alpha,approved,pending,false,false");
    expect(lines).toContain("beta,approved,,true,false");
  });
});
