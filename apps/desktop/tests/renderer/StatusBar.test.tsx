import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { StatusBar } from '@renderer/components/StatusBar'

function renderBar() {
  return render(
    <StatusBar
      vaultPath="/v"
      vaultName="My Vault"
      syncKey={0}
      lastSyncedAt={null}
      syncing={false}
      autoSyncMs={0}
      onSetAutoSync={() => {}}
      onSyncNow={() => {}}
      onOpenSourceControl={() => {}}
      onSwitchVault={() => {}}
      theme="light"
      onSetTheme={() => {}}
    />
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('StatusBar initial data fetch', () => {
  it('renders when all fetches resolve', async () => {
    vi.mocked(window.signoff.vault.getRemote).mockResolvedValue('git@github.com:org/proj.git')
    vi.mocked(window.signoff.vault.status).mockResolvedValue({ tracking: 'origin/main' } as never)
    vi.mocked(window.signoff.vault.author).mockResolvedValue({ name: 'Me', email: 'me@o.c' })
    vi.mocked(window.signoff.vault.syncState).mockResolvedValue({ branch: 'main', hasRemote: true, hasUpstream: true, ahead: 0, behind: 0 })
    renderBar()
    await waitFor(() => expect(screen.getByText('Me')).toBeInTheDocument())
    expect(screen.getByText('My Vault')).toBeInTheDocument()
  })

  it('still renders (does not crash or hang) when the Promise.all fetch rejects', async () => {
    vi.mocked(window.signoff.vault.getRemote).mockRejectedValue(new Error('boom'))
    vi.mocked(window.signoff.vault.author).mockRejectedValue(new Error('boom'))
    vi.mocked(window.signoff.vault.syncState).mockRejectedValue(new Error('boom'))
    renderBar()
    // Vault name (a prop, not fetched) always renders; the bar does not throw.
    expect(screen.getByText('My Vault')).toBeInTheDocument()
    // Indicators fall back to their empty placeholder rather than crashing.
    await waitFor(() => expect(screen.getAllByText('…').length).toBeGreaterThan(0))
  })
})

describe('StatusBar consolidated git cluster', () => {
  beforeEach(() => {
    vi.mocked(window.signoff.vault.getRemote).mockResolvedValue('git@github.com:org/proj.git')
    vi.mocked(window.signoff.vault.author).mockResolvedValue({ name: 'Me', email: 'me@o.c' })
  })

  it('collapses git options into a single "Source control" entry (no separate History/Contribute)', async () => {
    vi.mocked(window.signoff.vault.syncState).mockResolvedValue({ branch: 'main', hasRemote: true, hasUpstream: true, ahead: 0, behind: 0 })
    renderBar()
    await waitFor(() => expect(screen.getByLabelText('Source control')).toBeInTheDocument())
    expect(screen.queryByText('History')).toBeNull()
    expect(screen.queryByText('Contribute')).toBeNull()
    // synced + clean → repo name, no attention chip
    expect(screen.getByText('org/proj')).toBeInTheDocument()
  })

  it('flags "Publish" when a remote exists but the branch has no upstream', async () => {
    vi.mocked(window.signoff.vault.syncState).mockResolvedValue({ branch: 'main', hasRemote: true, hasUpstream: false, ahead: 0, behind: 0 })
    renderBar()
    await waitFor(() => expect(screen.getByText('Publish')).toBeInTheDocument())
  })

  it('shows ahead/behind counts when the branch has diverged', async () => {
    vi.mocked(window.signoff.vault.syncState).mockResolvedValue({ branch: 'main', hasRemote: true, hasUpstream: true, ahead: 1, behind: 2 })
    renderBar()
    await waitFor(() => expect(screen.getByText('↑1 ↓2')).toBeInTheDocument())
  })

  it('invites connecting when no remote is configured', async () => {
    vi.mocked(window.signoff.vault.getRemote).mockResolvedValue(null)
    vi.mocked(window.signoff.vault.syncState).mockResolvedValue({ branch: 'main', hasRemote: false, hasUpstream: false, ahead: 0, behind: 0 })
    renderBar()
    await waitFor(() => expect(screen.getByText('Connect repo')).toBeInTheDocument())
  })

  it('connects to Claude Code from the vault popover and reports the written path', async () => {
    vi.mocked(window.signoff.vault.syncState).mockResolvedValue({ branch: 'main', hasRemote: false, hasUpstream: false, ahead: 0, behind: 0 })
    vi.mocked(window.signoff.vault.connectClaude).mockResolvedValue({ settingsPath: '/v/.claude/settings.json' })
    renderBar()
    // open the vault popover
    fireEvent.click(screen.getByText('My Vault'))
    const btn = await screen.findByRole('button', { name: /connect to claude code/i })
    fireEvent.click(btn)
    await waitFor(() => expect(window.signoff.vault.connectClaude).toHaveBeenCalledWith('/v'))
    await waitFor(() => expect(screen.getByText(/\.claude\/settings\.json/)).toBeInTheDocument())
  })
})
