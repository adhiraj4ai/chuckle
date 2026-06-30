import { describe, it, expect } from 'vitest'
import { mergeSignoffSettings } from '../src/main/connect-claude.js'

const VAULT = '/home/me/project/.signoff'
const MATCHER = 'Write|Edit|MultiEdit|NotebookEdit'

describe('mergeSignoffSettings', () => {
  it('adds the signoff MCP server pointed at the vault', () => {
    const out = mergeSignoffSettings({}, VAULT)
    const server = out.mcpServers?.signoff as { command: string; args: string[] }
    expect(server.command).toBe('npx')
    expect(server.args).toEqual(['-y', '@signoff/mcp-server', '--vault', VAULT])
  })

  it('adds a PreToolUse hook matching the structured edit tools', () => {
    const out = mergeSignoffSettings({}, VAULT)
    const entry = out.hooks?.PreToolUse?.[0]
    expect(entry?.matcher).toBe(MATCHER)
    expect(entry?.hooks[0].command).toContain('@signoff/superpowers-hook')
  })

  it('preserves existing unrelated settings and hooks', () => {
    const existing = {
      model: 'opus',
      mcpServers: { other: { command: 'foo' } },
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'lint' }] }] },
    }
    const out = mergeSignoffSettings(existing, VAULT)
    expect(out.model).toBe('opus')
    expect(out.mcpServers?.other).toEqual({ command: 'foo' })
    // the unrelated Bash hook survives; signoff hook is added alongside it
    const commands = out.hooks!.PreToolUse!.flatMap((e) => e.hooks.map((h) => h.command))
    expect(commands).toContain('lint')
    expect(commands.some((c) => c.includes('@signoff/superpowers-hook'))).toBe(true)
  })

  it('is idempotent — running twice yields one signoff hook entry', () => {
    const once = mergeSignoffSettings({}, VAULT)
    const twice = mergeSignoffSettings(once, VAULT)
    const signoffHooks = twice.hooks!.PreToolUse!.filter((e) =>
      e.hooks.some((h) => h.command.includes('@signoff/superpowers-hook'))
    )
    expect(signoffHooks).toHaveLength(1)
    expect(Object.keys(twice.mcpServers!)).toEqual(['signoff'])
  })
})
