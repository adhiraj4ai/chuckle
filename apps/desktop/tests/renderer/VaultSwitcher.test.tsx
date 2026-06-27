import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VaultSwitcher } from '@renderer/components/VaultSwitcher'
import type { VaultInfo } from '@shared/ipc-types'

const mockVaults: VaultInfo[] = [
  { name: 'project-alpha', path: '/vaults/alpha', last_opened: '2026-06-27T10:00:00Z' },
  { name: 'project-beta', path: '/vaults/beta', last_opened: '2026-06-27T09:00:00Z' },
]

beforeEach(() => {
  vi.resetAllMocks()
})

describe('VaultSwitcher', () => {
  it('shows loading state then renders vault list', async () => {
    vi.mocked(window.chuckle.vault.list).mockResolvedValue(mockVaults)
    render(<VaultSwitcher onVaultSelected={() => {}} />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('project-alpha')).toBeInTheDocument())
    expect(screen.getByText('project-beta')).toBeInTheDocument()
  })

  it('calls onVaultSelected with path and name when vault clicked', async () => {
    vi.mocked(window.chuckle.vault.list).mockResolvedValue(mockVaults)
    const onSelected = vi.fn()
    render(<VaultSwitcher onVaultSelected={onSelected} />)
    await waitFor(() => screen.getByText('project-alpha'))
    fireEvent.click(screen.getByText('project-alpha'))
    expect(onSelected).toHaveBeenCalledWith('/vaults/alpha', 'project-alpha')
  })

  it('removes a recent project when its remove button is clicked', async () => {
    vi.mocked(window.chuckle.vault.list).mockResolvedValue(mockVaults)
    vi.mocked(window.chuckle.vault.remove).mockResolvedValue(undefined)
    render(<VaultSwitcher onVaultSelected={() => {}} />)
    await waitFor(() => screen.getByText('project-alpha'))
    fireEvent.click(screen.getByRole('button', { name: /remove project-alpha/i }))
    await waitFor(() => expect(window.chuckle.vault.remove).toHaveBeenCalledWith('/vaults/alpha'))
    await waitFor(() => expect(screen.queryByText('project-alpha')).not.toBeInTheDocument())
    expect(screen.getByText('project-beta')).toBeInTheDocument()
  })

  it('shows empty state when no projects registered', async () => {
    vi.mocked(window.chuckle.vault.list).mockResolvedValue([])
    render(<VaultSwitcher onVaultSelected={() => {}} />)
    await waitFor(() => screen.getByText(/no projects/i))
  })

  it('picks a folder and sets up a vault named after it on "Set up in a project"', async () => {
    vi.mocked(window.chuckle.vault.list).mockResolvedValue([])
    vi.mocked(window.chuckle.vault.selectDirectory).mockResolvedValue('/new/path')
    vi.mocked(window.chuckle.vault.create).mockResolvedValue({
      name: 'path',
      path: '/new/path/.signoff',
    })
    const onSelected = vi.fn()
    render(<VaultSwitcher onVaultSelected={onSelected} />)
    await waitFor(() => screen.getByText(/set up in a project/i))
    fireEvent.click(screen.getByText(/set up in a project/i))
    // No modal — the folder is picked and the name defaults to its basename.
    await waitFor(() => expect(window.chuckle.vault.selectDirectory).toHaveBeenCalled())
    await waitFor(() => expect(window.chuckle.vault.create).toHaveBeenCalledWith('/new/path', 'path'))
    await waitFor(() => expect(onSelected).toHaveBeenCalledWith('/new/path/.signoff', 'path'))
  })

  it('opens existing vault on "Open"', async () => {
    vi.mocked(window.chuckle.vault.list).mockResolvedValue([])
    vi.mocked(window.chuckle.vault.selectDirectory).mockResolvedValue('/existing/vault')
    vi.mocked(window.chuckle.vault.openExisting).mockResolvedValue({
      name: 'existing',
      path: '/existing/vault',
    })
    const onSelected = vi.fn()
    render(<VaultSwitcher onVaultSelected={onSelected} />)
    await waitFor(() => screen.getByRole('button', { name: 'Open' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => expect(window.chuckle.vault.selectDirectory).toHaveBeenCalled())
    await waitFor(() => expect(window.chuckle.vault.openExisting).toHaveBeenCalledWith('/existing/vault'))
    expect(onSelected).toHaveBeenCalledWith('/existing/vault', 'existing')
  })
})
