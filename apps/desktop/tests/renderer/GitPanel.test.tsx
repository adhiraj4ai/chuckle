import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GitPanel } from '@renderer/components/GitPanel'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(window.chuckle.vault.log).mockResolvedValue([])
  vi.mocked(window.chuckle.vault.getRemote).mockResolvedValue(null)
  vi.mocked(window.chuckle.vault.syncState).mockResolvedValue({ branch: 'main', hasRemote: false, hasUpstream: false, ahead: 0, behind: 0 })
  vi.mocked(window.chuckle.vault.connectRemote).mockResolvedValue({ ok: true })
})

it('shows a Connect remote form when there is no remote and calls connectRemote', async () => {
  render(<GitPanel vaultPath="/v" onClose={() => {}} />)
  await waitFor(() => screen.getByPlaceholderText(/git url/i))
  fireEvent.change(screen.getByPlaceholderText(/git url/i), { target: { value: 'git@github.com:o/p.git' } })
  fireEvent.click(screen.getByRole('button', { name: /connect/i }))
  await waitFor(() => expect(window.chuckle.vault.connectRemote).toHaveBeenCalledWith('/v', 'git@github.com:o/p.git'))
})

it('shows an auth error from connectRemote', async () => {
  vi.mocked(window.chuckle.vault.connectRemote).mockResolvedValue({ ok: false, error: 'Permission denied (publickey)', errorKind: 'auth' })
  render(<GitPanel vaultPath="/v" onClose={() => {}} />)
  await waitFor(() => screen.getByPlaceholderText(/git url/i))
  fireEvent.change(screen.getByPlaceholderText(/git url/i), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: /connect/i }))
  await waitFor(() => expect(screen.getByText(/authenticate|gh auth|ssh key/i)).toBeInTheDocument())
})
