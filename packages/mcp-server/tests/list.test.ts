import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  VaultManager,
  writeApproval,
  appendHistory,
  readApproval,
} from "@chuckle/vault-core";
import { handleList } from "../src/tools/list.js";

let tmpDir: string;
let vaultPath: string;

async function publishDoc(feature: string, type: "spec" | "plan") {
  const src = path.join(tmpDir, `${feature}-${type}.md`);
  await fs.writeFile(src, `# ${feature} ${type}\n`);
  const vault = await VaultManager.open(vaultPath);
  await vault.publish(src, feature, type, "dev@org.com", "Dev");
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "chuckle-mcp-list-"));
  vaultPath = path.join(tmpDir, "vault");
  process.env.CHUCKLE_HOME = path.join(tmpDir, ".chuckle");
  await VaultManager.create(vaultPath, "test-project", "test-org");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env.CHUCKLE_HOME;
});

describe("handleList", () => {
  it("returns empty array when no documents are pending", async () => {
    const result = await handleList(vaultPath);
    expect(result).toEqual([]);
  });

  it("returns pending spec after publish", async () => {
    await publishDoc("user-auth", "spec");
    const result = await handleList(vaultPath);
    expect(result).toHaveLength(1);
    expect(result[0].feature).toBe("user-auth");
    expect(result[0].type).toBe("spec");
    expect(result[0].submitted_by).toBe("dev@org.com");
    expect(result[0].submitted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns two pending items when two features are published", async () => {
    await publishDoc("user-auth", "spec");
    await publishDoc("payment-gw", "plan");
    const result = await handleList(vaultPath);
    expect(result).toHaveLength(2);
    const features = result.map((r) => r.feature).sort();
    expect(features).toEqual(["payment-gw", "user-auth"]);
  });

  it("does not include approved documents", async () => {
    await publishDoc("user-auth", "spec");
    const record = (await readApproval(vaultPath, "user-auth", "spec"))!;
    const approved = appendHistory(record, {
      action: "approved",
      by: "arch@org.com",
      at: new Date().toISOString(),
      message: null,
    });
    await writeApproval(vaultPath, approved);

    const result = await handleList(vaultPath);
    expect(result).toHaveLength(0);
  });

  it("does not include rejected documents", async () => {
    await publishDoc("user-auth", "spec");
    const record = (await readApproval(vaultPath, "user-auth", "spec"))!;
    const rejected = appendHistory(record, {
      action: "rejected",
      by: "arch@org.com",
      at: new Date().toISOString(),
      message: "needs work",
    });
    await writeApproval(vaultPath, rejected);

    const result = await handleList(vaultPath);
    expect(result).toHaveLength(0);
  });
});
