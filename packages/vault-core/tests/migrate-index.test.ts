import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { migrateToIndex } from "../src/migrate.js";
import { readManifest, getFeatureDoc } from "../src/manifest.js";
import { writeApproval } from "../src/approval.js";

let tmp: string, projectRoot: string, vaultPath: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "migrate-index-"));
  projectRoot = path.join(tmp, "project");
  vaultPath = path.join(projectRoot, ".signoff");
  await fs.mkdir(path.join(vaultPath, "specs"), { recursive: true });
  await fs.mkdir(path.join(vaultPath, "approvals"), { recursive: true });
  await fs.writeFile(path.join(vaultPath, "config.json"),
    JSON.stringify({ name: "p", created_at: "t", doc_roots: ["docs"] }) + "\n");
  // simulate a git repo so stageAndCommit works
  const { initVaultRepo } = await import("../src/git.js");
  await initVaultRepo(vaultPath);
});
afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

describe("migrateToIndex", () => {
  it("rebuilds the manifest from project docs and drops the copy", async () => {
    // old-layout copy in the vault + a matching project doc
    await fs.writeFile(path.join(vaultPath, "specs", "user-auth.md"), "# old copy\n");
    await writeApproval(vaultPath, {
      document: "spec.md", feature: "user-auth", type: "spec", workflow: "spec",
      status: "pending", history: [{ action: "submitted", by: "d@o.c", at: "t", message: null }],
    });
    await fs.mkdir(path.join(projectRoot, "docs", "specs"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "docs", "specs", "2026-06-27-user-auth-design.md"), "# real\n");

    const res = await migrateToIndex(vaultPath);
    expect(res.migrated).toBe(true);

    const m = await readManifest(vaultPath);
    expect(getFeatureDoc(m, "user-auth", "spec")).toBe("docs/specs/2026-06-27-user-auth-design.md");
    await expect(fs.stat(path.join(vaultPath, "specs", "user-auth.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps the vault copy as a fallback when no project doc matches", async () => {
    await fs.writeFile(path.join(vaultPath, "specs", "orphan.md"), "# orphan\n");
    await writeApproval(vaultPath, {
      document: "spec.md", feature: "orphan", type: "spec", workflow: "spec",
      status: "approved", history: [{ action: "approved", by: "d@o.c", at: "t", message: null }],
    });
    const res = await migrateToIndex(vaultPath);
    // A vault-copy fallback was set, so this feature is NOT unresolved.
    expect(res.unresolved).not.toContain("orphan/spec");
    const m = await readManifest(vaultPath);
    expect(getFeatureDoc(m, "orphan", "spec")).toBe(".signoff/specs/orphan.md");
    expect((await fs.stat(path.join(vaultPath, "specs", "orphan.md"))).isFile()).toBe(true);
  });

  it("records unresolved without a manifest entry when neither a project doc nor a vault copy exists", async () => {
    // approval exists, but no project doc and no vault copy
    await writeApproval(vaultPath, {
      document: "spec.md", feature: "ghost", type: "spec", workflow: "spec",
      status: "approved", history: [{ action: "approved", by: "d@o.c", at: "t", message: null }],
    });
    const res = await migrateToIndex(vaultPath);
    expect(res.unresolved).toContain("ghost/spec");
    const m = await readManifest(vaultPath);
    expect(getFeatureDoc(m, "ghost", "spec")).toBeNull();
  });

  it("classifies 'capacity-planning-design.md' as a spec, not a plan (anchored match)", async () => {
    await fs.writeFile(path.join(vaultPath, "specs", "capacity-planning.md"), "# old\n");
    await writeApproval(vaultPath, {
      document: "spec.md", feature: "capacity-planning", type: "spec", workflow: "spec",
      status: "pending", history: [{ action: "submitted", by: "d@o.c", at: "t", message: null }],
    });
    await fs.mkdir(path.join(projectRoot, "docs", "specs"), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, "docs", "specs", "2026-06-27-capacity-planning-design.md"),
      "# real\n"
    );

    await migrateToIndex(vaultPath);
    const m = await readManifest(vaultPath);
    // Must be mapped under "spec", not "plan".
    expect(getFeatureDoc(m, "capacity-planning", "spec")).toBe(
      "docs/specs/2026-06-27-capacity-planning-design.md"
    );
    expect(getFeatureDoc(m, "capacity-planning", "plan")).toBeNull();
  });

  it("classifies a real plan ('user-auth-plan.md') as a plan", async () => {
    await fs.mkdir(path.join(projectRoot, "docs"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "docs", "2026-06-27-user-auth-plan.md"), "# plan\n");
    await migrateToIndex(vaultPath);
    const m = await readManifest(vaultPath);
    expect(getFeatureDoc(m, "user-auth", "plan")).toBe("docs/2026-06-27-user-auth-plan.md");
    expect(getFeatureDoc(m, "user-auth", "spec")).toBeNull();
  });

  it("does NOT delete the vault copy when the mapped project file is missing on disk", async () => {
    // Vault copy exists. Manifest will map the feature to a project path that
    // does not actually exist (stale entry) — the copy must be preserved.
    await fs.writeFile(path.join(vaultPath, "specs", "user-auth.md"), "# vault copy\n");
    await writeApproval(vaultPath, {
      document: "spec.md", feature: "user-auth", type: "spec", workflow: "spec",
      status: "approved", history: [{ action: "approved", by: "d@o.c", at: "t", message: null }],
    });
    // Pre-seed the manifest with a non-.signoff mapping to a NON-existent file.
    await fs.writeFile(
      path.join(vaultPath, "index.json"),
      JSON.stringify({ version: 1, features: { "user-auth": { spec: "docs/specs/gone.md" } } }) + "\n"
    );

    await migrateToIndex(vaultPath);

    // The mapped project file does not exist, so the vault copy must survive.
    expect((await fs.stat(path.join(vaultPath, "specs", "user-auth.md"))).isFile()).toBe(true);
  });

  it("is a no-op on an already-migrated vault", async () => {
    await fs.writeFile(path.join(vaultPath, "index.json"), JSON.stringify({ version: 1, features: {} }) + "\n");
    await fs.rm(path.join(vaultPath, "specs"), { recursive: true, force: true });
    const res = await migrateToIndex(vaultPath);
    expect(res.migrated).toBe(false);
  });

  it("second call is a no-op when the only remaining copy is a fallback", async () => {
    // First migration: orphan approval → fallback copy kept in .signoff/specs/orphan.md
    await fs.writeFile(path.join(vaultPath, "specs", "orphan.md"), "# orphan\n");
    await writeApproval(vaultPath, {
      document: "spec.md", feature: "orphan", type: "spec", workflow: "spec",
      status: "approved", history: [{ action: "approved", by: "d@o.c", at: "t", message: null }],
    });
    const first = await migrateToIndex(vaultPath);
    expect(first.migrated).toBe(true);
    // Fallback copy was set, so orphan/spec is resolved (to the copy), not unresolved.
    expect(first.unresolved).not.toContain("orphan/spec");

    // Second call: index.json now exists; the only copy in specs/ is the
    // .signoff/specs/orphan.md fallback already recorded in the manifest.
    // Must be a no-op — not re-run the whole migration.
    const second = await migrateToIndex(vaultPath);
    expect(second.migrated).toBe(false);
  });
});
