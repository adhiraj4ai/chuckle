import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { installStatus } from "../src/main/installer.js";

// projectRoot = path.dirname(vaultPath) — the same derivation the IPC handlers use.
let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-ipc-"));
  process.env.SIGNOFF_HOME = path.join(tmp, "home");
  process.env.SIGNOFF_TOOLS_DIR = path.join(tmp, "src");
  await fs.mkdir(process.env.SIGNOFF_TOOLS_DIR, { recursive: true });
  await fs.writeFile(
    path.join(process.env.SIGNOFF_TOOLS_DIR, "version.json"),
    JSON.stringify({ version: "0.2.0" })
  );
});
afterEach(async () => {
  delete process.env.SIGNOFF_HOME;
  delete process.env.SIGNOFF_TOOLS_DIR;
  await fs.rm(tmp, { recursive: true, force: true });
});

it("installStatus resolves for a vault's project root", async () => {
  const vaultPath = path.join(tmp, "proj", ".signoff");
  await fs.mkdir(vaultPath, { recursive: true });
  const st = await installStatus(path.dirname(vaultPath));
  expect(st.gate).toBe("not_installed");
  expect(typeof st.nodeAvailable).toBe("boolean");
});
