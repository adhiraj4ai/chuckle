import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('shows empty state when no vaults registered', async () => {
    vi.mocked(window.chuckle.vault.list).mockResolvedValue([])
    render(<VaultSwitcher onVaultSelected={() => {}} />)
    await waitFor(() => screen.getByText(/no vaults/i))
  })

  it('opens directory dialog and creates vault on "New Vault"', async () => {
    vi.mocked(window.chuckle.vault.list).mockResolvedValue([])
    vi.mocked(window.chuckle.vault.selectDirectory).mockResolvedValue('/new/path')
    vi.mocked(window.chuckle.vault.create).mockResolvedValue({
      name: 'new-vault',
      path: '/new/path/.chuckle',
    })
    vi.mocked(window.chuckle.vault.list).mockResolvedValueOnce([]).mockResolvedValue([
      { name: 'new-vault', path: '/new/path', last_opened: '2026-06-27T00:00:00Z' },
    ])
    const onSelected = vi.fn()
    render(<VaultSwitcher onVaultSelected={onSelected} />)
    await waitFor(() => screen.getByText(/new vault/i))
    fireEvent.click(screen.getByText(/new vault/i))
    // Should prompt for vault name
    await waitFor(() => screen.getByPlaceholderText(/vault name/i))
    await userEvent.type(screen.getByPlaceholderText(/vault name/i), 'new-vault')
    await userEvent.type(screen.getByPlaceholderText(/org/i), 'test-org')
    fireEvent.click(screen.getByText(/create/i))
    await waitFor(() => expect(window.chuckle.vault.selectDirectory).toHaveBeenCalled())
    await waitFor(() => expect(window.chuckle.vault.create).toHaveBeenCalledWith('/new/path', 'new-vault', 'test-org'))
  })

  it('opens existing vault on "Open Vault"', async () => {
    vi.mocked(window.chuckle.vault.list).mockResolvedValue([])
    vi.mocked(window.chuckle.vault.selectDirectory).mockResolvedValue('/existing/vault')
    vi.mocked(window.chuckle.vault.openExisting).mockResolvedValue({
      name: 'existing',
      path: '/existing/vault',
    })
    const onSelected = vi.fn()
    render(<VaultSwitcher onVaultSelected={onSelected} />)
    await waitFor(() => screen.getByText(/open vault/i))
    fireEvent.click(screen.getByText(/open vault/i))
    await waitFor(() => expect(window.chuckle.vault.selectDirectory).toHaveBeenCalled())
    await waitFor(() => expect(window.chuckle.vault.openExisting).toHaveBeenCalledWith('/existing/vault'))
    expect(onSelected).toHaveBeenCalledWith('/existing/vault', 'existing')
  })
})
