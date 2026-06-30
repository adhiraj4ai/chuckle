import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { VaultManager, readManifest } from "@signoff/vault-core";
import { handlePublish } from "../src/tools/publish.js";

let project: string, vaultPath: string;
beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-mcp-tier-"));
  vaultPath = path.join(project, ".signoff");
  await VaultManager.create(vaultPath, "proj");
  await fs.mkdir(path.join(project, "docs"), { recursive: true });
  await fs.writeFile(path.join(project, "docs/x.md"), "# x");
});
afterEach(async () => {
  await fs.rm(project, { recursive: true, force: true });
});

it("handlePublish persists a suggested tier; invalid tier dropped", async () => {
  await handlePublish(
    vaultPath,
    {
      feature_name: "x",
      document_type: "spec",
      document_path: "docs/x.md",
      tier: "heavy",
    },
    project
  );
  expect((await readManifest(vaultPath)).features.x.tier).toBe("heavy");
  await handlePublish(
    vaultPath,
    {
      feature_name: "y",
      document_type: "spec",
      document_path: "docs/x.md",
      tier: "huge",
    },
    project
  );
  expect((await readManifest(vaultPath)).features.y?.tier).toBeUndefined();
});
