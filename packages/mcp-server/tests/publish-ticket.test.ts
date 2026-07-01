import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os"; import path from "node:path"; import fs from "node:fs/promises";
import { VaultManager, readManifest } from "@signoff/vault-core";
import { handlePublish } from "../src/tools/publish.js";

let project: string, vaultPath: string;
beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-mcp-ticket-"));
  vaultPath = path.join(project, ".signoff");
  await VaultManager.create(vaultPath, "proj");
  await fs.mkdir(path.join(project, "docs"), { recursive: true });
  await fs.writeFile(path.join(project, "docs/x.md"), "# x\n\n```mermaid\ngraph TD;A-->B\n```\n");
});
afterEach(async () => { await fs.rm(project, { recursive: true, force: true }); });

it("persists ticket id + url", async () => {
  await handlePublish(vaultPath, { feature_name: "x", document_type: "spec", document_path: "docs/x.md", ticket_id: "PROJ-1", ticket_url: "https://t/1" }, project);
  expect((await readManifest(vaultPath)).features.x.ticket).toEqual({ id: "PROJ-1", url: "https://t/1" });
});
it("stores id only when ticket_url has a bad scheme", async () => {
  await handlePublish(vaultPath, { feature_name: "x", document_type: "spec", document_path: "docs/x.md", ticket_id: "A-1", ticket_url: "javascript:1" }, project);
  expect((await readManifest(vaultPath)).features.x.ticket).toEqual({ id: "A-1" });
});
it("no ticket when ticket_id absent", async () => {
  await handlePublish(vaultPath, { feature_name: "x", document_type: "spec", document_path: "docs/x.md" }, project);
  expect((await readManifest(vaultPath)).features.x.ticket).toBeUndefined();
});
