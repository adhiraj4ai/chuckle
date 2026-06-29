import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  readManifest,
  writeManifest,
  getFeatureDoc,
  setFeatureDoc,
  removeFeatureDoc,
  manifestFeatureNames,
  resolveDocPath,
  projectRootOf,
  hashContent,
  type Manifest,
} from "../src/manifest.js";

let tmp: string;
let vaultPath: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "manifest-test-"));
  vaultPath = path.join(tmp, "project", ".signoff");
  await fs.mkdir(vaultPath, { recursive: true });
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("manifest", () => {
  it("returns an empty manifest when index.json is absent", async () => {
    const m = await readManifest(vaultPath);
    expect(m).toEqual({ version: 1, features: {} });
  });

  it("round-trips through write/read", async () => {
    const m: Manifest = { version: 1, features: { "user-auth": { spec: "docs/a.md" } } };
    await writeManifest(vaultPath, m);
    expect(await readManifest(vaultPath)).toEqual(m);
  });

  it("set/get/remove are pure and correct", () => {
    let m: Manifest = { version: 1, features: {} };
    m = setFeatureDoc(m, "user-auth", "spec", "docs/a.md");
    m = setFeatureDoc(m, "user-auth", "plan", "docs/b.md");
    expect(getFeatureDoc(m, "user-auth", "spec")).toBe("docs/a.md");
    expect(getFeatureDoc(m, "user-auth", "plan")).toBe("docs/b.md");
    m = removeFeatureDoc(m, "user-auth", "spec");
    expect(getFeatureDoc(m, "user-auth", "spec")).toBeNull();
    expect(getFeatureDoc(m, "missing", "spec")).toBeNull();
  });

  it("drops a feature with no remaining docs on remove", () => {
    let m: Manifest = { version: 1, features: { f: { spec: "docs/a.md" } } };
    m = removeFeatureDoc(m, "f", "spec");
    expect(manifestFeatureNames(m)).toEqual([]);
  });

  it("lists feature names sorted", () => {
    const m: Manifest = { version: 1, features: { beta: {}, alpha: {} } };
    expect(manifestFeatureNames(m)).toEqual(["alpha", "beta"]);
  });

  it("resolves a doc path against the project root (parent of vault)", () => {
    const m: Manifest = { version: 1, features: { f: { spec: "docs/a.md" } } };
    expect(resolveDocPath(vaultPath, m, "f", "spec")).toBe(
      path.join(projectRootOf(vaultPath), "docs/a.md")
    );
    expect(resolveDocPath(vaultPath, m, "f", "plan")).toBeNull();
  });

  it("hashes content deterministically and distinctly", () => {
    expect(hashContent("hello")).toBe(hashContent("hello"));
    expect(hashContent("hello")).not.toBe(hashContent("world"));
    expect(hashContent("hello")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("throws a clear error on a corrupt index.json (does NOT silently return empty)", async () => {
    await fs.writeFile(path.join(vaultPath, "index.json"), "{ half-written");
    await expect(readManifest(vaultPath)).rejects.toThrow(/corrupt JSON at .*index\.json/);
  });

  it("writeManifest is atomic — leaves no temp file behind", async () => {
    await writeManifest(vaultPath, { version: 1, features: { f: { spec: "docs/a.md" } } });
    const left = (await fs.readdir(vaultPath)).filter((f) => f.includes(".tmp"));
    expect(left).toEqual([]);
  });
});
