#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { resolveFeature } from "./resolve-feature.js";
import { runCheck } from "./check.js";
import { cloneVaultWithToken } from "./clone-vault.js";

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

export async function cmdCheck(argv: string[], env: NodeJS.ProcessEnv, cwd: string): Promise<number> {
  const feature = resolveFeature({
    feature: flag(argv, "feature") ?? env.SIGNOFF_FEATURE,
    prBody: flag(argv, "pr-body") ?? env.SIGNOFF_PR_BODY,
    branch: flag(argv, "branch") ?? env.SIGNOFF_BRANCH ?? env.GITHUB_HEAD_REF,
  });
  const projectRoot = flag(argv, "project") ?? cwd;
  if (!feature) {
    process.stderr.write("::error::SignOff: could not determine the feature. Add `Signoff-Feature: <slug>` to the PR body.\n");
    return 2;
  }
  const res = await runCheck({ projectRoot, feature });
  process.stdout.write(res.message + "\n");
  if (!res.ok) process.stderr.write(`::error::${res.message}\n`);
  return res.ok ? 0 : 1;
}

export async function cmdCloneVault(argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  const [url, dest] = argv;
  if (!url || !dest) {
    process.stderr.write("usage: signoff-ci clone-vault <url> <dest>\n");
    return 2;
  }
  try {
    await cloneVaultWithToken(url, dest, env.VAULT_TOKEN || undefined);
    return 0;
  } catch (err) {
    process.stderr.write(`::error::SignOff: vault clone failed (${err instanceof Error ? err.message : String(err)}).\n`);
    return 1;
  }
}

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "check") return cmdCheck(rest, process.env, process.cwd());
  if (cmd === "clone-vault") return cmdCloneVault(rest, process.env);
  process.stderr.write("usage: signoff-ci <check|clone-vault> [...]\n");
  return 2;
}

const isEntry = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`::error::SignOff: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    });
}
