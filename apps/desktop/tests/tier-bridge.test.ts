import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { VaultManager } from "@signoff/vault-core";
import { listFeatures, setFeatureTierBridge } from "../src/main/vault-bridge.js";

let project: string, vaultPath: string;
beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-tierb-"));
  vaultPath = path.join(project, ".signoff");
  await VaultManager.create(vaultPath, "proj");
  await fs.mkdir(path.join(project, "docs"), { recursive: true });
  await fs.writeFile(path.join(project, "docs/x.md"), "# x");
  await (await VaultManager.open(vaultPath)).submitForReview("x", "spec", "docs/x.md", "a@o.c", "A");
});
afterEach(async () => { await fs.rm(project, { recursive: true, force: true }); });

describe("tier bridge", () => {
  it("listFeatures resolves tier (default standard); setFeatureTierBridge persists", async () => {
    expect((await listFeatures(vaultPath)).find(f => f.name === "x")!.tier).toBe("standard");
    await setFeatureTierBridge(vaultPath, "x", "heavy");
    expect((await listFeatures(vaultPath)).find(f => f.name === "x")!.tier).toBe("heavy");
  });
});
