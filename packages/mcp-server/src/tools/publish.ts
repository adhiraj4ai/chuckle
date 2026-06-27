import path from "node:path";
import { simpleGit } from "simple-git";
import {
  VaultManager,
  inferFeatureName,
  type DocumentType,
  type PublishResult,
} from "@chuckle/vault-core";

async function resolveGitAuthor(vaultPath: string): Promise<{ name: string; email: string }> {
  const git = simpleGit(vaultPath);
  const [nameResult, emailResult] = await Promise.all([
    git.getConfig("user.name"),
    git.getConfig("user.email"),
  ]);
  const name = nameResult.value ?? "Unknown";
  const email = emailResult.value ?? "unknown@local";
  return { name, email };
}

export async function handlePublish(
  vaultPath: string,
  args: unknown
): Promise<PublishResult> {
  if (typeof args !== "object" || args === null) {
    throw new Error("args must be a plain object");
  }

  const { source_path, feature_name, document_type } = args as Record<
    string,
    unknown
  >;

  if (typeof source_path !== "string") {
    throw new Error("source_path must be a string");
  }
  if (document_type !== "spec" && document_type !== "plan") {
    throw new Error(
      `document_type must be "spec" or "plan", got: ${String(document_type)}`
    );
  }

  const resolvedType = document_type as DocumentType;
  const resolvedFeature =
    typeof feature_name === "string" && feature_name.length > 0
      ? feature_name
      : inferFeatureName(path.basename(source_path));

  const { name, email } = await resolveGitAuthor(vaultPath);
  const vault = await VaultManager.open(vaultPath);
  return vault.publish(source_path, resolvedFeature, resolvedType, email, name);
}
