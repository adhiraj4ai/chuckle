import fs from "node:fs/promises";
import path from "node:path";
import type { VaultWorkflows, WorkflowConfig, DocumentType } from "./types.js";

export async function readWorkflows(vaultPath: string): Promise<VaultWorkflows> {
  const filePath = path.join(vaultPath, "workflows.json");
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as VaultWorkflows;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`workflows.json not found at ${filePath}`);
    }
    throw err;
  }
}

export function getWorkflowForType(
  workflows: VaultWorkflows,
  type: DocumentType
): WorkflowConfig {
  return workflows[type];
}
