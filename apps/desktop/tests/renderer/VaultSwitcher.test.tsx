import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
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

  it('two-step setup: picks folder, shows form, calls create with approvers', async () => {
    vi.mocked(window.chuckle.vault.list).mockResolvedValue([])
    vi.mocked(window.chuckle.vault.selectDirectory).mockResolvedValue('/new/path')
    vi.mocked(window.chuckle.vault.create).mockResolvedValue({
      name: 'path',
      path: '/new/path/.signoff',
    })
    vi.mocked(window.chuckle.vault.onSetupProgress).mockReturnValue(() => {})
    const onSelected = vi.fn()
    render(<VaultSwitcher onVaultSelected={onSelected} />)
    await waitFor(() => screen.getByText(/set up in a project/i))
    fireEvent.click(screen.getByText(/set up in a project/i))
    await waitFor(() => expect(window.chuckle.vault.selectDirectory).toHaveBeenCalled())
    // form should appear with an approvers input
    await waitFor(() => expect(screen.getByRole('textbox', { name: /approvers/i })).toBeInTheDocument())
    fireEvent.change(screen.getByRole('textbox', { name: /approvers/i }), {
      target: { value: 'lead@o.c' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() =>
      expect(window.chuckle.vault.create).toHaveBeenCalledWith('/new/path', 'path', ['lead@o.c'])
    )
    await waitFor(() => expect(onSelected).toHaveBeenCalledWith('/new/path/.signoff', 'path'))
  })

  it('shows progress bar when onSetupProgress fires done/total', async () => {
    let capturedCb: ((p: { done: number; total: number }) => void) | null = null
    vi.mocked(window.chuckle.vault.list).mockResolvedValue([])
    vi.mocked(window.chuckle.vault.selectDirectory).mockResolvedValue('/new/path')
    vi.mocked(window.chuckle.vault.create).mockImplementation(
      () => new Promise(() => { /* never resolves — keeps busy state */ })
    )
    vi.mocked(window.chuckle.vault.onSetupProgress).mockImplementation((cb) => {
      capturedCb = cb
      return () => {}
    })
    render(<VaultSwitcher onVaultSelected={() => {}} />)
    await waitFor(() => screen.getByText(/set up in a project/i))
    fireEvent.click(screen.getByText(/set up in a project/i))
    await waitFor(() => expect(window.chuckle.vault.selectDirectory).toHaveBeenCalled())
    await waitFor(() => screen.getByRole('button', { name: /^create$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }))
    // simulate progress event
    act(() => {
      capturedCb!({ done: 2, total: 5 })
    })
    await waitFor(() => {
      const bar = screen.getByRole('progressbar')
      expect(bar).toHaveAttribute('aria-valuenow', '2')
      expect(bar).toHaveAttribute('aria-valuemax', '5')
    })
    expect(screen.getByText(/2 of 5/i)).toBeInTheDocument()
  })

  it('ignores a second Create click while setup is in flight', async () => {
    vi.mocked(window.chuckle.vault.list).mockResolvedValue([])
    vi.mocked(window.chuckle.vault.selectDirectory).mockResolvedValue('/new/path')
    // create never resolves, so the first invocation stays in flight
    vi.mocked(window.chuckle.vault.create).mockImplementation(
      () => new Promise(() => { /* never resolves */ })
    )
    vi.mocked(window.chuckle.vault.onSetupProgress).mockReturnValue(() => {})
    render(<VaultSwitcher onVaultSelected={() => {}} />)
    await waitFor(() => screen.getByText(/set up in a project/i))
    fireEvent.click(screen.getByText(/set up in a project/i))
    await waitFor(() => screen.getByRole('button', { name: /^create$/i }))
    const createButton = screen.getByRole('button', { name: /^create$/i })
    // double-click before the busy paint swaps the form for the progress bar
    fireEvent.click(createButton)
    fireEvent.click(createButton)
    await waitFor(() => expect(window.chuckle.vault.create).toHaveBeenCalledTimes(1))
    expect(window.chuckle.vault.onSetupProgress).toHaveBeenCalledTimes(1)
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
