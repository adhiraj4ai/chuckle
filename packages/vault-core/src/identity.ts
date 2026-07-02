import { simpleGit } from "simple-git";

/**
 * Best-effort git identity for `cwd`. Returns null on any failure (never throws)
 * so audit recording stays fail-open.
 */
export async function resolveGitIdentity(
  cwd: string,
): Promise<{ name: string; email: string } | null> {
  try {
    const git = simpleGit(cwd);
    const [n, e] = await Promise.all([git.getConfig("user.name"), git.getConfig("user.email")]);
    if (!e.value) return null;
    return { name: n.value ?? "Unknown", email: e.value };
  } catch {
    return null;
  }
}
