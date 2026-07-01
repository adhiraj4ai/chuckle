import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os"; import path from "node:path"; import fs from "node:fs/promises";
import { VaultManager, readManifest } from "@signoff/vault-core";
import { handlePublish } from "../src/tools/publish.js";

let project: string, vaultPath: string;
beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-mcp-adr-"));
  vaultPath = path.join(project, ".signoff");
  await VaultManager.create(vaultPath, "proj");
  await fs.mkdir(path.join(project, "docs"), { recursive: true });
  await fs.writeFile(path.join(project, "docs/x-adr.md"), "# Decision");
});
afterEach(async () => { await fs.rm(project, { recursive: true, force: true }); });

it("handlePublish accepts document_type adr and registers it", async () => {
  await handlePublish(vaultPath, { feature_name: "x", document_type: "adr", document_path: "docs/x-adr.md" }, project);
  expect((await readManifest(vaultPath)).features.x.adr).toBe("docs/x-adr.md");
});

it("still rejects an unknown document_type", async () => {
  await expect(
    handlePublish(vaultPath, { feature_name: "x", document_type: "diagram", document_path: "docs/x-adr.md" }, project)
  ).rejects.toThrow();
});
