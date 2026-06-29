import { describe, it, expect } from "vitest";
import { inferFeatureName, validateFeatureName } from "../src/feature.js";
import { documentPath } from "../src/layout.js";
import { approvalFilePath } from "../src/approval.js";

describe("inferFeatureName", () => {
  it("extracts feature from dated design filename", () => {
    expect(inferFeatureName("2026-06-27-user-auth-design.md")).toBe("user-auth");
  });

  it("extracts feature from dated plan filename", () => {
    expect(inferFeatureName("2026-06-27-payment-gateway.md")).toBe("payment-gateway");
  });

  it("handles filename without date prefix", () => {
    expect(inferFeatureName("user-auth-design.md")).toBe("user-auth");
  });

  it("handles plain feature name", () => {
    expect(inferFeatureName("user-auth.md")).toBe("user-auth");
  });

  it("handles absolute paths by using only the basename", () => {
    expect(inferFeatureName("/home/dev/project/docs/specs/2026-06-27-user-auth-design.md")).toBe("user-auth");
  });

  it("lowercases the result", () => {
    expect(inferFeatureName("2026-06-27-UserAuth-design.md")).toBe("userauth");
  });
});

describe("validateFeatureName (path-traversal defense)", () => {
  it("accepts a plain slug", () => {
    expect(validateFeatureName("user-auth")).toBe("user-auth");
  });

  it.each([
    "../../etc/passwd",
    "../escape",
    "..",
    ".",
    "a/b",
    "a\\b",
    "foo/../bar",
    "..\\win",
    "",
    "with\0null",
  ])("rejects %j", (bad) => {
    expect(() => validateFeatureName(bad)).toThrow();
  });

  it("documentPath rejects traversal feature names", () => {
    expect(() => documentPath("/vault", "../../x", "spec")).toThrow(/invalid feature name/);
  });

  it("approvalFilePath rejects traversal feature names", () => {
    expect(() => approvalFilePath("/vault", "../../x", "spec")).toThrow(/invalid feature name/);
  });

  it("a traversal feature name cannot escape the vault dir via documentPath", () => {
    // Sanity: a valid name stays inside the vault; the invalid one throws above.
    expect(documentPath("/vault", "ok", "spec")).toBe("/vault/specs/ok.md");
  });
});
