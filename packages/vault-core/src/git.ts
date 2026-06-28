import { simpleGit, CheckRepoActions, type SimpleGit } from "simple-git";

export class SyncConflictError extends Error {
  constructor(message = "sync conflict") {
    super(message);
    this.name = "SyncConflictError";
  }
}

export type GitErrorKind = "auth" | "conflict" | "network" | "other";

export function classifyGitError(message: string): GitErrorKind {
  const m = message.toLowerCase();
  if (
    m.includes("could not read username") ||
    m.includes("authentication failed") ||
    m.includes("permission denied (publickey") ||
    m.includes("terminal prompts disabled") ||
    m.includes("invalid username or password")
  ) return "auth";
  if (
    m.includes("conflict") ||
    m.includes("could not apply") ||
    m.includes("needs merge")
  ) return "conflict";
  if (
    m.includes("could not resolve host") ||
    m.includes("connection timed out") ||
    m.includes("connection refused") ||
    m.includes("network is unreachable")
  ) return "network";
  return "other";
}

export interface SyncState {
  branch: string | null;
  hasRemote: boolean;
  hasUpstream: boolean;
  ahead: number;
  behind: number;
}

// All network ops disable the credential prompt so a missing credential fails
// fast (classified as "auth") instead of blocking on an interactive prompt.
//
// simple-git's block-unsafe-operations plugin rejects certain env vars
// (EDITOR, GIT_EDITOR, PAGER, GIT_PAGER, GIT_ASKPASS, GIT_SEQUENCE_EDITOR,
// GIT_CONFIG_COUNT, GIT_CONFIG_KEY_*, GIT_CONFIG_VALUE_*) unless the matching
// allowUnsafe* flag is set. IDE wrappers (Claude Code, VS Code, etc.) routinely
// set these. Rather than stripping them (which would break system git config
// like safe.bareRepository that arrive via GIT_CONFIG_*), we enable the unsafe
// flags — they only govern whether simple-git will forward these env vars, not
// whether git itself acts on them.
const UNSAFE_FLAGS = {
  allowUnsafeEditor: true,
  allowUnsafePager: true,
  allowUnsafeAskPass: true,
  allowUnsafeConfigPaths: true,
  allowUnsafeConfigEnvCount: true,
} as const;

function git(vaultPath: string): SimpleGit {
  return simpleGit({ baseDir: vaultPath, unsafe: UNSAFE_FLAGS })
    .env({ ...process.env, GIT_TERMINAL_PROMPT: "0" });
}

export async function initVaultRepo(vaultPath: string): Promise<void> {
  const g = simpleGit(vaultPath);
  // IS_REPO_ROOT (not the default IS_REPO_ROOT-or-descendant): when the vault
  // lives inside a parent repo (e.g. <project>/.chuckle), a plain checkIsRepo()
  // returns true for the parent and we'd skip init — leaving the vault without
  // its own .git, so commits would fall through to the parent (which gitignores
  // .chuckle). Only treat it as initialized if THIS dir is itself a repo root.
  const isRepoRoot = await g.checkIsRepo(CheckRepoActions.IS_REPO_ROOT);
  if (!isRepoRoot) {
    await g.init();
  }
}

export async function stageAndCommit(
  vaultPath: string,
  files: string[],
  message: string,
  authorEmail: string,
  authorName: string
): Promise<string> {
  const g = simpleGit(vaultPath);
  await g.add(files);
  await g.commit(message, undefined, {
    "--author": `${authorName} <${authorEmail}>`,
  });
  return getHeadSha(vaultPath);
}

export async function getHeadSha(vaultPath: string): Promise<string> {
  const g = simpleGit(vaultPath);
  const log = await g.log({ maxCount: 1 });
  if (!log.latest) throw new Error("no commits in vault repo");
  return log.latest.hash;
}

export async function hasRemote(vaultPath: string): Promise<boolean> {
  const remotes = await simpleGit(vaultPath).getRemotes();
  return remotes.length > 0;
}

export async function getRemoteUrl(vaultPath: string): Promise<string | null> {
  const remotes = await simpleGit(vaultPath).getRemotes(true);
  const origin = remotes.find((r) => r.name === "origin") ?? remotes[0];
  return origin?.refs.fetch || origin?.refs.push || null;
}

export async function addRemote(vaultPath: string, url: string, name = "origin"): Promise<void> {
  const g = simpleGit(vaultPath);
  const remotes = await g.getRemotes();
  if (remotes.some((r) => r.name === name)) await g.remote(["set-url", name, url]);
  else await g.addRemote(name, url);
}

export async function getCurrentBranch(vaultPath: string): Promise<string> {
  return (await simpleGit(vaultPath).status()).current ?? "main";
}

export async function publishBranch(vaultPath: string): Promise<void> {
  const branch = await getCurrentBranch(vaultPath);
  await git(vaultPath).push(["-u", "origin", branch]);
}

export async function fetch(vaultPath: string): Promise<void> {
  await git(vaultPath).fetch();
}

export async function pullRebase(vaultPath: string): Promise<void> {
  const g = git(vaultPath);
  try {
    await g.raw(["pull", "--rebase"]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (classifyGitError(msg) === "conflict") {
      try { await simpleGit(vaultPath).raw(["rebase", "--abort"]); } catch { /* nothing to abort */ }
      throw new SyncConflictError(msg);
    }
    throw err;
  }
}

export async function push(vaultPath: string): Promise<void> {
  await git(vaultPath).push();
}

export async function resetHardToUpstream(vaultPath: string): Promise<void> {
  const branch = await getCurrentBranch(vaultPath);
  await git(vaultPath).fetch();
  await simpleGit(vaultPath).raw(["reset", "--hard", `origin/${branch}`]);
}

export async function cloneVault(url: string, destDir: string): Promise<void> {
  await simpleGit({ unsafe: UNSAFE_FLAGS })
    .env({ ...process.env, GIT_TERMINAL_PROMPT: "0" })
    .clone(url, destDir);
}

export async function getSyncState(vaultPath: string): Promise<SyncState> {
  try {
    const s = await simpleGit(vaultPath).status();
    return {
      branch: s.current,
      hasRemote: await hasRemote(vaultPath),
      hasUpstream: s.tracking != null,
      ahead: s.ahead,
      behind: s.behind,
    };
  } catch {
    return { branch: null, hasRemote: false, hasUpstream: false, ahead: 0, behind: 0 };
  }
}

// Back-compat aliases for existing callers.
export async function pullLatest(vaultPath: string): Promise<void> { return pullRebase(vaultPath); }
export async function pushToRemote(vaultPath: string): Promise<void> { return push(vaultPath); }
