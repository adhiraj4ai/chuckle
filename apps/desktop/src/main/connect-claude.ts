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

/** Matches any PreToolUse entry that runs the SignOff gate (node bundle or legacy npx). */
function isSignoffHook(entry: PreToolUseEntry): boolean {
  return entry.hooks?.some((h) => typeof h.command === 'string' && /signoff-gate|@signoff\/superpowers-hook/.test(h.command))
}

/**
 * Merge SignOff's MCP server + PreToolUse hook into an existing Claude Code
 * settings object without clobbering unrelated keys. Idempotent: re-running
 * replaces the single `signoff` server and the single SignOff hook entry.
 */
export function mergeSignoffSettings(
  existing: ClaudeSettings,
  opts: { mcpCommand: string; mcpArgs: string[]; hookCommand: string }
): ClaudeSettings {
  const mcpServers = { ...(existing.mcpServers ?? {}) }
  mcpServers.signoff = { command: opts.mcpCommand, args: opts.mcpArgs }

  const hooks = { ...(existing.hooks ?? {}) }
  const existingPre = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : []
  const preserved = existingPre.filter((e) => !isSignoffHook(e))
  preserved.push({ matcher: HOOK_MATCHER, hooks: [{ type: 'command', command: opts.hookCommand }] })
  hooks.PreToolUse = preserved

  return { ...existing, mcpServers, hooks }
}

/**
 * Strip SignOff's MCP server + PreToolUse hook entry from an existing Claude
 * Code settings object, leaving unrelated keys untouched. Drops the
 * `mcpServers`/`hooks` containers entirely if they become empty.
 */
export function removeSignoffSettings(existing: ClaudeSettings): ClaudeSettings {
  const next: ClaudeSettings = { ...existing }
  if (next.mcpServers) {
    const { signoff, ...rest } = next.mcpServers as Record<string, unknown>
    next.mcpServers = rest
    if (Object.keys(rest).length === 0) delete next.mcpServers
  }
  if (next.hooks?.PreToolUse) {
    const kept = next.hooks.PreToolUse.filter((e) => !isSignoffHook(e))
    const hooks = { ...next.hooks }
    if (kept.length) hooks.PreToolUse = kept
    else delete hooks.PreToolUse
    next.hooks = Object.keys(hooks).length ? hooks : undefined
    if (next.hooks === undefined) delete next.hooks
  }
  return next
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

  // interim (Task 4 replaces this with the installer):
  const merged = mergeSignoffSettings(existing, { mcpCommand: 'npx', mcpArgs: ['-y', MCP_PACKAGE, '--vault', vaultPath], hookCommand: `npx -y ${HOOK_PACKAGE}` })
  await writeFileAtomic(settingsPath, JSON.stringify(merged, null, 2) + '\n')
  return { settingsPath }
}
