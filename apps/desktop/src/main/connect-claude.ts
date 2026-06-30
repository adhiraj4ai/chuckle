import path from 'node:path'
import fs from 'node:fs/promises'
import { writeFileAtomic } from '@signoff/vault-core'

export interface PreToolUseEntry {
  matcher: string
  hooks: { type: string; command: string }[]
}
export interface ClaudeSettings {
  mcpServers?: Record<string, unknown>
  hooks?: { PreToolUse?: PreToolUseEntry[]; [k: string]: unknown }
  [k: string]: unknown
}

const HOOK_MATCHER = 'Write|Edit|MultiEdit|NotebookEdit'
const MCP_PACKAGE = '@signoff/mcp-server'
const HOOK_PACKAGE = '@signoff/superpowers-hook'

/** True for any PreToolUse entry that runs the SignOff gate. */
function isSignoffEntry(entry: PreToolUseEntry): boolean {
  return entry.hooks?.some((h) => typeof h.command === 'string' && h.command.includes(HOOK_PACKAGE))
}

/**
 * Merge SignOff's MCP server + PreToolUse hook into an existing Claude Code
 * settings object without clobbering unrelated keys. Idempotent: re-running
 * replaces the single `signoff` server and the single SignOff hook entry.
 */
export function mergeSignoffSettings(existing: ClaudeSettings, vaultPath: string): ClaudeSettings {
  const mcpServers = { ...(existing.mcpServers ?? {}) }
  mcpServers.signoff = { command: 'npx', args: ['-y', MCP_PACKAGE, '--vault', vaultPath] }

  const hooks = { ...(existing.hooks ?? {}) }
  const existingPre = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : []
  const preserved = existingPre.filter((e) => !isSignoffEntry(e))
  preserved.push({
    matcher: HOOK_MATCHER,
    hooks: [{ type: 'command', command: `npx -y ${HOOK_PACKAGE}` }],
  })
  hooks.PreToolUse = preserved

  return { ...existing, mcpServers, hooks }
}

/**
 * Write the merged settings to <project>/.claude/settings.json, where the
 * project root is the vault's parent. Returns the settings path written.
 */
export async function connectClaudeCode(vaultPath: string): Promise<{ settingsPath: string }> {
  const projectRoot = path.dirname(vaultPath)
  const claudeDir = path.join(projectRoot, '.claude')
  const settingsPath = path.join(claudeDir, 'settings.json')

  await fs.mkdir(claudeDir, { recursive: true })

  let existing: ClaudeSettings = {}
  try {
    existing = JSON.parse(await fs.readFile(settingsPath, 'utf-8')) as ClaudeSettings
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }

  const merged = mergeSignoffSettings(existing, vaultPath)
  await writeFileAtomic(settingsPath, JSON.stringify(merged, null, 2) + '\n')
  return { settingsPath }
}
