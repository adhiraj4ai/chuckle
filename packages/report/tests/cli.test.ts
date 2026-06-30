import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { VaultManager } from "@signoff/vault-core";
import { runReport } from "../src/cli.js";

let project: string, vaultPath: string;
beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-report-cli-"));
  vaultPath = path.join(project, ".signoff");
  await VaultManager.create(vaultPath, "proj");
});
afterEach(async () => { await fs.rm(project, { recursive: true, force: true }); });

describe("runReport", () => {
  it("md format returns code 0 and a markdown summary", async () => {
    const r = await runReport(["--vault", vaultPath, "--format", "md"], project);
    expect(r.code).toBe(0);
    expect(r.out).toContain("# SignOff approval report");
  });
  it("csv format returns the csv header", async () => {
    const r = await runReport(["--vault", vaultPath, "--format", "csv"], project);
    expect(r.code).toBe(0);
    expect(r.out).toContain("feature,spec,plan,spec_stale,plan_stale");
  });
  it("defaults --vault to <cwd>/.signoff and --format to md", async () => {
    const r = await runReport([], project);
    expect(r.code).toBe(0);
    expect(r.out).toContain("# SignOff approval report");
  });
  it("missing vault → code 1", async () => {
    const r = await runReport(["--vault", path.join(project, "nope")], project);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/not a SignOff vault/);
  });
  it("unknown format → code 2", async () => {
    const r = await runReport(["--vault", vaultPath, "--format", "pdf"], project);
    expect(r.code).toBe(2);
  });
});
