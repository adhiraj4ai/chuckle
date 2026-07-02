import { describe, it, expect, afterEach } from "vitest";
import os from "node:os"; import path from "node:path";
import { signoffHome } from "../src/index.js";

const orig = process.env.SIGNOFF_HOME;
afterEach(() => { if (orig === undefined) delete process.env.SIGNOFF_HOME; else process.env.SIGNOFF_HOME = orig; });

describe("signoffHome", () => {
  it("honors SIGNOFF_HOME when set", () => {
    process.env.SIGNOFF_HOME = "/tmp/custom-home";
    expect(signoffHome()).toBe("/tmp/custom-home");
  });
  it("defaults to ~/.signoff when unset", () => {
    delete process.env.SIGNOFF_HOME;
    expect(signoffHome()).toBe(path.join(os.homedir(), ".signoff"));
  });
});
