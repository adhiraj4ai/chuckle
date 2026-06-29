import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { writeJsonAtomic, writeFileAtomic, parseJsonOrThrow } from "../src/fsutil.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "fsutil-"));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("writeJsonAtomic", () => {
  it("writes correct content and leaves no temp file behind", async () => {
    const target = path.join(tmp, "data.json");
    await writeJsonAtomic(target, { a: 1, b: "x" });
    expect(JSON.parse(await fs.readFile(target, "utf-8"))).toEqual({ a: 1, b: "x" });
    // no stray *.tmp files in the directory
    const left = (await fs.readdir(tmp)).filter((f) => f.includes(".tmp"));
    expect(left).toEqual([]);
  });

  it("creates parent directories as needed", async () => {
    const target = path.join(tmp, "nested", "deep", "data.json");
    await writeJsonAtomic(target, { ok: true });
    expect(JSON.parse(await fs.readFile(target, "utf-8"))).toEqual({ ok: true });
  });

  it("overwrites an existing file atomically (replaces content)", async () => {
    const target = path.join(tmp, "data.json");
    await writeFileAtomic(target, "old");
    await writeFileAtomic(target, "new");
    expect(await fs.readFile(target, "utf-8")).toBe("new");
    const left = (await fs.readdir(tmp)).filter((f) => f.includes(".tmp"));
    expect(left).toEqual([]);
  });
});

describe("parseJsonOrThrow", () => {
  it("returns parsed value for valid JSON", () => {
    expect(parseJsonOrThrow<{ x: number }>('{"x":1}', "/p")).toEqual({ x: 1 });
  });

  it("throws a clear path-tagged error for corrupt JSON", () => {
    expect(() => parseJsonOrThrow("{ nope", "/some/file.json")).toThrow(
      /corrupt JSON at \/some\/file\.json/
    );
  });
});
