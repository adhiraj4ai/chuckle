import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os"; import path from "node:path"; import fs from "node:fs/promises";
import { VaultManager } from "@signoff/vault-core";
import { listFeatures, setFeatureTicketBridge } from "../src/main/vault-bridge.js";

let project: string, vaultPath: string;
beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-tb-"));
  vaultPath = path.join(project, ".signoff");
  await VaultManager.create(vaultPath, "proj");
  await fs.mkdir(path.join(project, "docs"), { recursive: true });
  await fs.writeFile(path.join(project, "docs/x.md"), "# x");
  await (await VaultManager.open(vaultPath)).submitForReview("x", "spec", "docs/x.md", "a@o.c", "A");
});
afterEach(async () => { await fs.rm(project, { recursive: true, force: true }); });

it("listFeatures resolves ticket (null when unset)", async () => {
  const before = (await listFeatures(vaultPath)).find((f) => f.name === "x")!;
  expect(before.ticket).toBeNull();
  await setFeatureTicketBridge(vaultPath, "x", { id: "PROJ-9", url: "https://t/9" });
  const after = (await listFeatures(vaultPath)).find((f) => f.name === "x")!;
  expect(after.ticket).toEqual({ id: "PROJ-9", url: "https://t/9" });
});
it("setFeatureTicketBridge clears with null", async () => {
  await setFeatureTicketBridge(vaultPath, "x", { id: "A-1" });
  await setFeatureTicketBridge(vaultPath, "x", null);
  expect((await listFeatures(vaultPath)).find((f) => f.name === "x")!.ticket).toBeNull();
});
