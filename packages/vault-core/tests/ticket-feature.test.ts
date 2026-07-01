import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os"; import path from "node:path"; import fs from "node:fs/promises";
import { VaultManager, readManifest, writeManifest, setFeatureTicket } from "../src/index.js";

let project: string, vaultPath: string;
beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-ticket-"));
  vaultPath = path.join(project, ".signoff");
  await VaultManager.create(vaultPath, "proj");
  await fs.mkdir(path.join(project, "docs"), { recursive: true });
});
afterEach(async () => { await fs.rm(project, { recursive: true, force: true }); });

describe("setFeatureTicket", () => {
  it("sets a normalized ticket and clears with null", async () => {
    let m = await readManifest(vaultPath);
    m = setFeatureTicket(m, "x", { id: "PROJ-1", url: "https://t/1" });
    expect(m.features.x.ticket).toEqual({ id: "PROJ-1", url: "https://t/1" });
    m = setFeatureTicket(m, "x", null);
    expect(m.features.x.ticket).toBeUndefined();
  });
  it("stores id only when the url has a bad scheme", async () => {
    const m = setFeatureTicket(await readManifest(vaultPath), "x", { id: "A-1", url: "javascript:1" });
    expect(m.features.x.ticket).toEqual({ id: "A-1" });
  });
  it("clears when id is empty", async () => {
    let m = setFeatureTicket(await readManifest(vaultPath), "x", { id: "A-1" });
    m = setFeatureTicket(m, "x", { id: "  " });
    expect(m.features.x.ticket).toBeUndefined();
  });
});

describe("submitForReview ticket no-clobber", () => {
  it("sets the ticket when the feature has none", async () => {
    await fs.writeFile(path.join(project, "docs/x.md"), "# x");
    const v = await VaultManager.open(vaultPath);
    await v.submitForReview("x", "spec", "docs/x.md", "a@o.c", "A", { ticket: { id: "T-1", url: "https://t/1" } });
    expect((await readManifest(vaultPath)).features.x.ticket).toEqual({ id: "T-1", url: "https://t/1" });
  });
  it("does not overwrite an existing ticket", async () => {
    await fs.writeFile(path.join(project, "docs/x.md"), "# x");
    // seed an existing ticket
    await writeManifest(vaultPath, setFeatureTicket(await readManifest(vaultPath), "x", { id: "ORIG" }));
    const v = await VaultManager.open(vaultPath);
    await v.submitForReview("x", "spec", "docs/x.md", "a@o.c", "A", { ticket: { id: "NEW" } });
    expect((await readManifest(vaultPath)).features.x.ticket).toEqual({ id: "ORIG" });
  });
});
