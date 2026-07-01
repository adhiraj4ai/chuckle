import { describe, it, expect } from "vitest";
import { normalizeTicket } from "../src/index.js";

describe("normalizeTicket", () => {
  it("keeps id + https url", () => {
    expect(normalizeTicket({ id: "PROJ-123", url: "https://jira/x" })).toEqual({ id: "PROJ-123", url: "https://jira/x" });
  });
  it("keeps id + http url", () => {
    expect(normalizeTicket({ id: "A-1", url: "http://t/1" })).toEqual({ id: "A-1", url: "http://t/1" });
  });
  it("trims whitespace on id and url", () => {
    expect(normalizeTicket({ id: "  A-1  ", url: "  https://t/1  " })).toEqual({ id: "A-1", url: "https://t/1" });
  });
  it("returns null for an empty/whitespace id", () => {
    expect(normalizeTicket({ id: "   ", url: "https://t/1" })).toBeNull();
    expect(normalizeTicket({ id: "" })).toBeNull();
    expect(normalizeTicket(null)).toBeNull();
    expect(normalizeTicket(undefined)).toBeNull();
  });
  it("drops a non-http(s) url but keeps the id", () => {
    expect(normalizeTicket({ id: "A-1", url: "javascript:alert(1)" })).toEqual({ id: "A-1" });
    expect(normalizeTicket({ id: "A-1", url: "file:///etc/passwd" })).toEqual({ id: "A-1" });
    expect(normalizeTicket({ id: "A-1", url: "not a url" })).toEqual({ id: "A-1" });
  });
  it("returns just { id } when no url given", () => {
    expect(normalizeTicket({ id: "A-1" })).toEqual({ id: "A-1" });
  });
});
