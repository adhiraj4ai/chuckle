import fs from "node:fs/promises";
import path from "node:path";
import type { VaultWorkflows, WorkflowConfig, DocumentType } from "./types.js";

export async function readWorkflows(vaultPath: string): Promise<VaultWorkflows> {
  const filePath = path.join(vaultPath, ".chuckle", "workflows.json");
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as VaultWorkflows;
  } catch {
    throw new Error("workflows.json not found");
  }
}

export function getWorkflowForType(
  workflows: VaultWorkflows,
  type: DocumentType
): WorkflowConfig {
  return workflows[type];
}
