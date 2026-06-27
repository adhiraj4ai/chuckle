import { simpleGit, CheckRepoActions } from "simple-git";

export async function initVaultRepo(vaultPath: string): Promise<void> {
  const git = simpleGit(vaultPath);
  // IS_REPO_ROOT (not the default IS_REPO_ROOT-or-descendant): when the vault
  // lives inside a parent repo (e.g. <project>/.chuckle), a plain checkIsRepo()
  // returns true for the parent and we'd skip init — leaving the vault without
  // its own .git, so commits would fall through to the parent (which gitignores
  // .chuckle). Only treat it as initialized if THIS dir is itself a repo root.
  const isRepoRoot = await git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT);
  if (!isRepoRoot) {
    await git.init();
  }
}

export async function stageAndCommit(
  vaultPath: string,
  files: string[],
  message: string,
  authorEmail: string,
  authorName: string
): Promise<string> {
  const git = simpleGit(vaultPath);
  await git.add(files);
  await git.commit(message, undefined, {
    "--author": `${authorName} <${authorEmail}>`,
  });
  return getHeadSha(vaultPath);
}

export async function pullLatest(vaultPath: string): Promise<void> {
  const git = simpleGit(vaultPath);
  await git.pull();
}

export async function pushToRemote(vaultPath: string): Promise<void> {
  const git = simpleGit(vaultPath);
  await git.push();
}

export async function getHeadSha(vaultPath: string): Promise<string> {
  const git = simpleGit(vaultPath);
  const log = await git.log({ maxCount: 1 });
  if (!log.latest) throw new Error("no commits in vault repo");
  return log.latest.hash;
}
