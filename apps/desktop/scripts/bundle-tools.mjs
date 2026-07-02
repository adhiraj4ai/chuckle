import { execSync } from "node:child_process";
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, "..");
const repo = path.resolve(desktop, "..", "..");
const out = path.join(desktop, "resources", "tools");

// 1. Ensure the source packages are built to dist (esbuild bundles the dist entries).
execSync("npm run build -w @signoff/vault-core -w @signoff/mcp-server -w @signoff/superpowers-hook", { cwd: repo, stdio: "inherit" });

fs.mkdirSync(out, { recursive: true });

// 2. Bundle each tool into one dependency-inlined ESM (.mjs) file. ESM — not CJS —
//    because mcp-server gates startup on `import.meta.url`, which esbuild leaves EMPTY
//    in CJS output (the server would silently never start). The createRequire banner
//    lets any bundled CJS dep call require() under ESM output.
const common = {
  bundle: true, platform: "node", format: "esm", target: "node20", legalComments: "none",
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
};
const results = await Promise.all([
  build({ ...common, entryPoints: [path.join(repo, "packages/mcp-server/dist/index.js")], outfile: path.join(out, "signoff-mcp.mjs") }),
  build({ ...common, entryPoints: [path.join(repo, "packages/superpowers-hook/dist/cli.js")], outfile: path.join(out, "signoff-gate.mjs") }),
]);
// Fail loudly on ANY esbuild warning (e.g. empty-import-meta) — a silent bad bundle ships a dead tool.
const warnings = results.flatMap((r) => r.warnings);
if (warnings.length) { for (const w of warnings) console.error("esbuild warning:", w.text); throw new Error(`esbuild emitted ${warnings.length} warning(s) — refusing to ship a possibly-broken bundle`); }

// 3. Stage the workflow skill + version marker.
fs.copyFileSync(path.join(repo, "packages/claude-plugin/skills/signoff/SKILL.md"), path.join(out, "SKILL.md"));
const version = JSON.parse(fs.readFileSync(path.join(desktop, "package.json"), "utf-8")).version;
fs.writeFileSync(path.join(out, "version.json"), JSON.stringify({ version }, null, 2) + "\n");

console.log(`bundled tools → ${out} (v${version})`);
