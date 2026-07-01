import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { App } from '@renderer/App'
import type { FeatureEntry } from '@shared/ipc-types'

const userAuth: FeatureEntry = { name: 'user-auth', spec: 'pending', plan: 'not_found', adr: 'not_found', category: null, tags: [], tier: 'standard', ticket: null }
const auditLog: FeatureEntry = { name: 'audit-log', spec: 'pending', plan: 'not_found', adr: 'not_found', category: null, tags: [], tier: 'standard', ticket: null }

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  vi.mocked(window.signoff.vault.list).mockResolvedValue([
    { name: 'project-alpha', path: '/vault', last_opened: '2026-06-30T00:00:00Z' },
  ])
  vi.mocked(window.signoff.vault.sync).mockResolvedValue(undefined)
  vi.mocked(window.signoff.vault.push).mockResolvedValue({ ok: true } as never)
  vi.mocked(window.signoff.vault.getRemote).mockResolvedValue(null)
  vi.mocked(window.signoff.vault.status).mockResolvedValue({ branch: 'main', tracking: null, ahead: 0, behind: 0 })
  vi.mocked(window.signoff.vault.author).mockResolvedValue({ name: 'Dev', email: 'dev@org.com' })
  // defaults for the open-document path (ReviewPanel / DocumentPane mount)
  vi.mocked(window.signoff.project.readClaudeMd).mockResolvedValue(null)
  vi.mocked(window.signoff.document.isStale).mockResolvedValue(false)
  vi.mocked(window.signoff.document.read).mockResolvedValue('# Doc')
  vi.mocked(window.signoff.document.getApproval).mockResolvedValue(null)
  vi.mocked(window.signoff.workflows.read).mockResolvedValue({} as never)
})

async function openProject(): Promise<void> {
  render(<App />)
  fireEvent.click(await screen.findByText('project-alpha'))
}

describe('App: manual sync refreshes the feature list (#issue1)', () => {
  it('re-lists features after "Sync now" so a newly-published spec appears', async () => {
    vi.mocked(window.signoff.features.list).mockResolvedValueOnce([userAuth])
    await openProject()
    await screen.findByText('User Auth')
    expect(screen.queryByText('Audit Log')).not.toBeInTheDocument()

    // A new spec is published into the vault between syncs.
    vi.mocked(window.signoff.features.list).mockResolvedValue([userAuth, auditLog])

    fireEvent.click(screen.getByTitle('Pull and push now'))

    await waitFor(() => expect(screen.getByText('Audit Log')).toBeInTheDocument())
  })

  it('still re-lists features when the pull fails (offline / no upstream)', async () => {
    vi.mocked(window.signoff.features.list).mockResolvedValueOnce([userAuth])
    await openProject()
    await screen.findByText('User Auth')

    // pull throws, but the local manifest already has the new feature
    vi.mocked(window.signoff.vault.sync).mockRejectedValue(new Error('no upstream configured'))
    vi.mocked(window.signoff.features.list).mockResolvedValue([userAuth, auditLog])

    fireEvent.click(screen.getByTitle('Pull and push now'))

    await waitFor(() => expect(screen.getByText('Audit Log')).toBeInTheDocument())
  })

  it('the Sidebar "Sync" button also refreshes the feature list', async () => {
    vi.mocked(window.signoff.features.list).mockResolvedValueOnce([userAuth])
    await openProject()
    await screen.findByText('User Auth')

    vi.mocked(window.signoff.features.list).mockResolvedValue([userAuth, auditLog])
    fireEvent.click(screen.getByTitle('Pull the latest documents from the vault'))

    await waitFor(() => expect(screen.getByText('Audit Log')).toBeInTheDocument())
  })

  it('flags a synced-in feature as "New" and clears the flag once it is opened (#issue2)', async () => {
    vi.mocked(window.signoff.features.list).mockResolvedValueOnce([userAuth])
    vi.mocked(window.signoff.document.read).mockResolvedValue('# Audit Log Spec')
    vi.mocked(window.signoff.document.getApproval).mockResolvedValue(null)
    vi.mocked(window.signoff.workflows.read).mockResolvedValue({} as never)
    await openProject()
    await screen.findByText('User Auth')
    // the baseline feature is not flagged
    expect(within(screen.getByLabelText('user-auth')).queryByTitle('New — not opened yet')).toBeNull()

    vi.mocked(window.signoff.features.list).mockResolvedValue([userAuth, auditLog])
    fireEvent.click(screen.getByTitle('Pull and push now'))

    // the newly-arrived feature carries the New badge
    const newRow = await screen.findByLabelText('audit-log')
    expect(within(newRow).getByTitle('New — not opened yet')).toBeInTheDocument()

    // opening it clears the badge
    fireEvent.click(newRow)
    await waitFor(() =>
      expect(within(screen.getByLabelText('audit-log')).queryByTitle('New — not opened yet')).toBeNull()
    )
  })
})
