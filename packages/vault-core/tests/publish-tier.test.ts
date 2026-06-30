import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { VaultManager, readManifest } from "../src/index.js";

let project: string, vaultPath: string;
beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-ptier-"));
  vaultPath = path.join(project, ".signoff");
  await VaultManager.create(vaultPath, "proj");
  await fs.mkdir(path.join(project, "docs"), { recursive: true });
  await fs.writeFile(path.join(project, "docs/x.md"), "# x");
});
afterEach(async () => {
  await fs.rm(project, { recursive: true, force: true });
});

it("sets tier when unset; re-publish does not clobber", async () => {
  const v = await VaultManager.open(vaultPath);
  await v.submitForReview("x", "spec", "docs/x.md", "a@o.c", "A", {
    tier: "light",
  });
  expect((await readManifest(vaultPath)).features.x.tier).toBe("light");
  await v.submitForReview("x", "spec", "docs/x.md", "a@o.c", "A", {
    tier: "heavy",
  });
  expect((await readManifest(vaultPath)).features.x.tier).toBe("light"); // not clobbered
});
