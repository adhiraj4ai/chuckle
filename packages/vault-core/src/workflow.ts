import fs from "node:fs/promises";
import path from "node:path";
import type { VaultWorkflows, WorkflowConfig, DocumentType } from "./types.js";
import { parseJsonOrThrow, writeJsonAtomic } from "./fsutil.js";

export async function readWorkflows(vaultPath: string): Promise<VaultWorkflows> {
  const filePath = path.join(vaultPath, "workflows.json");
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`workflows.json not found at ${filePath}`);
    }
    throw err;
  }
  return parseJsonOrThrow<VaultWorkflows>(raw, filePath);
}

export function getWorkflowForType(
  workflows: VaultWorkflows,
  type: DocumentType
): WorkflowConfig {
  return workflows[type];
}

export async function writeWorkflows(vaultPath: string, workflows: VaultWorkflows): Promise<void> {
  const filePath = path.join(vaultPath, "workflows.json");
  await writeJsonAtomic(filePath, workflows);
}
