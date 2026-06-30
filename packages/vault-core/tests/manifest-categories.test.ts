import { describe, it, expect } from "vitest";
import {
  listCategories, upsertCategory, removeCategory,
  setFeatureCategory, setFeatureTags, ensureCategory,
  type Manifest,
} from "../src/manifest.js";

const base: Manifest = { version: 2, categories: [], features: {} };

describe("category helpers", () => {
  it("upsertCategory inserts then replaces by id", () => {
    let m = upsertCategory(base, { id: "backend", name: "Backend", color: "blue" });
    expect(listCategories(m)).toHaveLength(1);
    m = upsertCategory(m, { id: "backend", name: "Back End", color: "green" });
    expect(listCategories(m)).toHaveLength(1);
    expect(m.categories[0]).toEqual({ id: "backend", name: "Back End", color: "green" });
  });

  it("removeCategory drops it and clears the id off referencing features", () => {
    let m = upsertCategory(base, { id: "backend", name: "Backend", color: "blue" });
    m = setFeatureCategory(m, "user-auth", "backend");
    m = removeCategory(m, "backend");
    expect(listCategories(m)).toHaveLength(0);
    expect(m.features["user-auth"]?.category).toBeUndefined();
  });

  it("setFeatureTags normalizes", () => {
    const m = setFeatureTags(base, "user-auth", [" A ", "a", "B"]);
    expect(m.features["user-auth"].tags).toEqual(["a", "b"]);
  });

  it("ensureCategory matches by name case-insensitively, else creates with next unused color", () => {
    let res = ensureCategory(base, "Backend");
    expect(res.id).toBe("backend");
    expect(res.manifest.categories[0].color).toBe("red"); // first unused
    const again = ensureCategory(res.manifest, "backend");
    expect(again.id).toBe("backend");
    expect(again.manifest.categories).toHaveLength(1); // no duplicate
    const second = ensureCategory(again.manifest, "UI");
    expect(second.manifest.categories[1].color).toBe("orange"); // next unused
  });

  it("ensureCategory falls back to round-robin when all 7 colors are used", () => {
    let m = base;
    for (const n of ["a", "b", "c", "d", "e", "f", "g"]) m = ensureCategory(m, n).manifest;
    const res = ensureCategory(m, "h");
    expect(res.manifest.categories[7].color).toBe("red"); // 7 % 7 == 0 -> red
  });
});
