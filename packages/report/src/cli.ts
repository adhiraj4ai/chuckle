#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { collectReport } from "./collect.js";
import { renderMarkdown, renderCsv } from "./render.js";

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

function isVault(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, "config.json"));
  } catch {
    return false;
  }
}

export async function runReport(argv: string[], cwd: string): Promise<{ code: number; out: string; err: string }> {
  const vaultPath = flag(argv, "vault") ?? path.join(cwd, ".signoff");
  const format = flag(argv, "format") ?? "md";
  if (format !== "md" && format !== "csv") {
    return { code: 2, out: "", err: `unknown --format "${format}" (expected md|csv)\n` };
  }
  if (!isVault(vaultPath)) {
    return { code: 1, out: "", err: `not a SignOff vault: ${vaultPath}\n` };
  }
  try {
    const report = await collectReport(vaultPath);
    const out = format === "csv" ? renderCsv(report) : renderMarkdown(report);
    return { code: 0, out, err: "" };
  } catch (err) {
    return { code: 1, out: "", err: `signoff-report failed: ${err instanceof Error ? err.message : String(err)}\n` };
  }
}

const isEntry = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
  runReport(process.argv.slice(2), process.cwd()).then(({ code, out, err }) => {
    if (out) process.stdout.write(out);
    if (err) process.stderr.write(err);
    process.exit(code);
  });
}
