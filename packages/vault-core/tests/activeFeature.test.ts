import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { writeActiveFeature, readActiveFeature } from "../src/activeFeature.js";

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "signoff-ptr-test-"));
});

afterEach(async () => {
  await fs.rm(projectRoot, { recursive: true, force: true });
});

describe("active-feature pointer", () => {
  it("writes the pointer with feature, vaultPath, and ISO publishedAt", async () => {
    const written = await writeActiveFeature(projectRoot, {
      feature: "user-auth",
      vaultPath: "/abs/vault",
    });
    expect(written.feature).toBe("user-auth");
    expect(written.vaultPath).toBe("/abs/vault");
    expect(written.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);

    const onDisk = JSON.parse(
      await fs.readFile(path.join(projectRoot, ".signoff", "active-feature.json"), "utf-8")
    );
    expect(onDisk).toEqual(written);
  });

  it("reads back a written pointer", async () => {
    await writeActiveFeature(projectRoot, { feature: "billing", vaultPath: "/v" });
    const read = await readActiveFeature(projectRoot);
    expect(read?.feature).toBe("billing");
    expect(read?.vaultPath).toBe("/v");
    expect(read?.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it("overwrites the pointer on a second write", async () => {
    await writeActiveFeature(projectRoot, { feature: "first", vaultPath: "/v" });
    await writeActiveFeature(projectRoot, { feature: "second", vaultPath: "/v" });
    const read = await readActiveFeature(projectRoot);
    expect(read?.feature).toBe("second");
  });

  it("returns null when no pointer exists", async () => {
    expect(await readActiveFeature(projectRoot)).toBeNull();
  });

  it("throws when the pointer is malformed", async () => {
    await fs.mkdir(path.join(projectRoot, ".signoff"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, ".signoff", "active-feature.json"), "{ not json");
    await expect(readActiveFeature(projectRoot)).rejects.toThrow();
  });

  it("throws when required fields are missing", async () => {
    await fs.mkdir(path.join(projectRoot, ".signoff"), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, ".signoff", "active-feature.json"),
      JSON.stringify({ feature: "x" })
    );
    await expect(readActiveFeature(projectRoot)).rejects.toThrow(/vaultPath/);
  });

  it("throws when publishedAt is missing", async () => {
    await fs.mkdir(path.join(projectRoot, ".signoff"), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, ".signoff", "active-feature.json"),
      JSON.stringify({ feature: "x", vaultPath: "/v" })
    );
    await expect(readActiveFeature(projectRoot)).rejects.toThrow(/publishedAt/);
  });
});
