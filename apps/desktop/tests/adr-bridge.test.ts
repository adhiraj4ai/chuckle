import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { VaultManager } from "@signoff/vault-core";
import { listFeatures } from "../src/main/vault-bridge.js";

let project: string, vaultPath: string;
beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-adrb-"));
  vaultPath = path.join(project, ".signoff");
  await VaultManager.create(vaultPath, "proj");
  await fs.mkdir(path.join(project, "docs"), { recursive: true });
  await fs.writeFile(path.join(project, "docs/x-adr.md"), "# Decision");
  await (await VaultManager.open(vaultPath)).submitForReview("x", "adr", "docs/x-adr.md", "a@o.c", "A");
});
afterEach(async () => {
  await fs.rm(project, { recursive: true, force: true });
});

it("listFeatures resolves adr status (pending when submitted, not_found otherwise)", async () => {
  const x = (await listFeatures(vaultPath)).find((f) => f.name === "x")!;
  expect(x.adr).toBe("pending");
});
