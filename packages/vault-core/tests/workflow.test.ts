import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readWorkflows, getWorkflowForType } from "../src/workflow.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "chuckle-test-"));
  await fs.mkdir(path.join(tmpDir, ".chuckle"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const sampleWorkflows = {
  spec: {
    required_approvers: ["arch@org.com"],
    min_approvals: 1,
  },
  plan: {
    required_approvers: ["lead@org.com"],
    optional_approvers: ["pm@org.com"],
    min_approvals: 1,
  },
};

describe("readWorkflows", () => {
  it("reads and parses workflows.json", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".chuckle", "workflows.json"),
      JSON.stringify(sampleWorkflows)
    );
    const result = await readWorkflows(tmpDir);
    expect(result.spec.required_approvers).toEqual(["arch@org.com"]);
    expect(result.plan.optional_approvers).toEqual(["pm@org.com"]);
  });

  it("throws if workflows.json does not exist", async () => {
    await expect(readWorkflows(tmpDir)).rejects.toThrow("workflows.json not found");
  });
});

describe("getWorkflowForType", () => {
  it("returns spec workflow for spec type", () => {
    const wf = getWorkflowForType(sampleWorkflows, "spec");
    expect(wf.required_approvers).toEqual(["arch@org.com"]);
  });

  it("returns plan workflow for plan type", () => {
    const wf = getWorkflowForType(sampleWorkflows, "plan");
    expect(wf.required_approvers).toEqual(["lead@org.com"]);
  });
});
