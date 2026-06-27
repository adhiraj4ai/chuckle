import { simpleGit } from "simple-git";

export async function resolveGitAuthor(
  vaultPath: string
): Promise<{ name: string; email: string }> {
  const git = simpleGit(vaultPath);
  const [nameResult, emailResult] = await Promise.all([
    git.getConfig("user.name"),
    git.getConfig("user.email"),
  ]);
  return {
    name: nameResult.value ?? "Unknown",
    email: emailResult.value ?? "unknown@local",
  };
}
