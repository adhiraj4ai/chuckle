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
import { handleCheck } from "../src/tools/check.js";

let tmpDir: string;
let vaultPath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "chuckle-mcp-check-"));
  vaultPath = path.join(tmpDir, "vault");
  process.env.CHUCKLE_HOME = path.join(tmpDir, ".chuckle");
  await VaultManager.create(vaultPath, "test-project", "test-org");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env.CHUCKLE_HOME;
});

describe("handleCheck", () => {
  it("returns not_found when no approval record exists", async () => {
    const result = await handleCheck(vaultPath, {
      feature_name: "user-auth",
      document_type: "spec",
    });
    expect(result.status).toBe("not_found");
  });

  it("returns pending after a document is submitted", async () => {
    const sourcePath = path.join(tmpDir, "spec.md");
    await fs.writeFile(sourcePath, "# Spec\n");
    const vault = await VaultManager.open(vaultPath);
    await vault.publish(sourcePath, "user-auth", "spec", "dev@org.com", "Dev");

    const result = await handleCheck(vaultPath, {
      feature_name: "user-auth",
      document_type: "spec",
    });
    expect(result.status).toBe("pending");
  });

  it("returns approved with approved_by and approved_at after approval", async () => {
    const sourcePath = path.join(tmpDir, "spec.md");
    await fs.writeFile(sourcePath, "# Spec\n");
    const vault = await VaultManager.open(vaultPath);
    await vault.publish(sourcePath, "user-auth", "spec", "dev@org.com", "Dev");

    const record = (await readApproval(vaultPath, "user-auth", "spec"))!;
    const approved = appendHistory(record, {
      action: "approved",
      by: "arch@org.com",
      at: "2026-06-27T14:00:00Z",
      message: "LGTM",
    });
    await writeApproval(vaultPath, approved);

    const result = await handleCheck(vaultPath, {
      feature_name: "user-auth",
      document_type: "spec",
    });
    expect(result.status).toBe("approved");
    expect(result.approved_by).toBe("arch@org.com");
    expect(result.approved_at).toBe("2026-06-27T14:00:00Z");
  });

  it("throws if document_type is invalid", async () => {
    await expect(
      handleCheck(vaultPath, { feature_name: "user-auth", document_type: "brief" })
    ).rejects.toThrow(/document_type/);
  });
});
