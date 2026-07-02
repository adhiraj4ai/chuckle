import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { InstallPanel } from '@renderer/components/InstallPanel'

beforeEach(() => {
  vi.mocked(window.signoff.install.status).mockResolvedValue({
    gate: 'not_installed',
    skill: 'not_installed',
    installedVersion: null,
    appVersion: '0.2.0',
    nodeAvailable: true,
  })
  vi.mocked(window.signoff.install.apply).mockResolvedValue({
    gate: 'installed',
    skill: 'installed',
    installedVersion: '0.2.0',
    appVersion: '0.2.0',
    nodeAvailable: true,
  })
  vi.mocked(window.signoff.install.remove).mockResolvedValue({
    gate: 'not_installed',
    skill: 'not_installed',
    installedVersion: '0.2.0',
    appVersion: '0.2.0',
    nodeAvailable: true,
  })
})

describe('InstallPanel', () => {
  it('installs the checked components', async () => {
    render(<InstallPanel vaultPath="/p/.signoff" onClose={() => {}} />)
    await waitFor(() => screen.getByText(/approval gate/i))
    fireEvent.click(screen.getByRole('button', { name: /^install/i }))
    await waitFor(() =>
      expect(window.signoff.install.apply).toHaveBeenCalledWith('/p/.signoff', { gate: true, skill: true })
    )
  })

  it('disables gate install and warns when node is missing', async () => {
    vi.mocked(window.signoff.install.status).mockResolvedValue({
      gate: 'not_installed',
      skill: 'not_installed',
      installedVersion: null,
      appVersion: '0.2.0',
      nodeAvailable: false,
    })
    render(<InstallPanel vaultPath="/p/.signoff" onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText(/node\.js is required/i)).toBeInTheDocument())
  })

  it('uninstalls the checked components', async () => {
    vi.mocked(window.signoff.install.status).mockResolvedValue({
      gate: 'installed',
      skill: 'installed',
      installedVersion: '0.2.0',
      appVersion: '0.2.0',
      nodeAvailable: true,
    })
    render(<InstallPanel vaultPath="/p/.signoff" onClose={() => {}} />)
    await waitFor(() => screen.getByText(/approval gate/i))
    fireEvent.click(screen.getByRole('button', { name: /uninstall/i }))
    await waitFor(() =>
      expect(window.signoff.install.remove).toHaveBeenCalledWith('/p/.signoff', { gate: true, skill: true })
    )
  })
})
