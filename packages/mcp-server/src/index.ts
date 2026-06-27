#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

function parseVaultArg(argv: string[]): string {
  const idx = argv.indexOf("--vault");
  if (idx === -1 || idx + 1 >= argv.length) {
    process.stderr.write(
      "Usage: chuckle-mcp --vault /path/to/vault\n"
    );
    process.exit(1);
  }
  return argv[idx + 1];
}

async function main() {
  const vaultPath = parseVaultArg(process.argv.slice(2));
  const server = createServer(vaultPath);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
