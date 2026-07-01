import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { ReviewerSettings } from '@renderer/components/ReviewerSettings'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(window.signoff.workflows.read).mockResolvedValue({
    spec: { required_approvers: ['lead@org.com'], min_approvals: 1 },
    plan: { required_approvers: [], min_approvals: 1 },
    adr: { required_approvers: [], min_approvals: 1 },
  } as never)
  vi.mocked(window.signoff.workflows.write).mockResolvedValue(undefined)
})

describe('ReviewerSettings', () => {
  it('loads current approvers and saves edits', async () => {
    const onClose = vi.fn()
    render(<ReviewerSettings vaultPath="/v" onClose={onClose} />)
    await waitFor(() => screen.getByDisplayValue('lead@org.com'))
    fireEvent.change(screen.getByLabelText(/spec approvers/i), { target: { value: 'lead@org.com, arch@org.com' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(window.signoff.workflows.write).toHaveBeenCalledWith('/v', expect.objectContaining({
      spec: expect.objectContaining({ required_approvers: ['lead@org.com', 'arch@org.com'] }),
    })))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('escapes the loading state and shows an error when workflows.read fails', async () => {
    vi.mocked(window.signoff.workflows.read).mockRejectedValue(new Error('unreadable'))
    render(<ReviewerSettings vaultPath="/v" onClose={() => {}} />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/couldn't load reviewer settings/i)).toBeInTheDocument())
  })

  it('clamps min_approvals to at least 1 when saving', async () => {
    const onClose = vi.fn()
    render(<ReviewerSettings vaultPath="/v" onClose={onClose} />)
    await waitFor(() => screen.getByDisplayValue('lead@org.com'))
    // switch to threshold mode so the min input is visible
    const specSection = (await screen.findByRole('heading', { name: 'Spec' })).closest('section') as HTMLElement
    fireEvent.click(within(specSection).getByRole('radio', { name: /at least/i }))
    const minInputs = screen.getAllByRole('spinbutton')
    // set spec min to 0 (invalid) — should clamp to 1
    fireEvent.change(minInputs[0], { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(window.signoff.workflows.write).toHaveBeenCalledWith('/v', expect.objectContaining({
      spec: expect.objectContaining({ min_approvals: 1 }),
    })))
  })
})

it('defaults to "All listed approvers" and hides the min input until threshold is chosen', async () => {
  vi.mocked(window.signoff.workflows.read).mockResolvedValue({
    spec: { required_approvers: ['a@o.c', 'b@o.c'], min_approvals: 1 },
    plan: { required_approvers: [], min_approvals: 1 },
    adr: { required_approvers: [], min_approvals: 1 },
  } as never)
  render(<ReviewerSettings vaultPath="/v" onClose={() => {}} />)
  const specSection = (await screen.findByRole('heading', { name: 'Spec' })).closest('section') as HTMLElement
  // unanimous selected; no min input shown for spec
  expect(within(specSection).getByRole('radio', { name: /all listed approvers/i })).toBeChecked()
  expect(within(specSection).queryByLabelText(/minimum approvals/i)).toBeNull()
})

it('reveals the min input in threshold mode and persists approval_mode on save', async () => {
  vi.mocked(window.signoff.workflows.read).mockResolvedValue({
    spec: { required_approvers: ['a@o.c', 'b@o.c', 'c@o.c'], min_approvals: 1 },
    plan: { required_approvers: [], min_approvals: 1 },
    adr: { required_approvers: [], min_approvals: 1 },
  } as never)
  vi.mocked(window.signoff.workflows.write).mockResolvedValue(undefined as never)
  render(<ReviewerSettings vaultPath="/v" onClose={() => {}} />)
  const specSection = (await screen.findByRole('heading', { name: 'Spec' })).closest('section') as HTMLElement
  fireEvent.click(within(specSection).getByRole('radio', { name: /at least/i }))
  const min = within(specSection).getByLabelText(/minimum approvals/i)
  fireEvent.change(min, { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: /save/i }))
  await waitFor(() => expect(window.signoff.workflows.write).toHaveBeenCalled())
  const written = vi.mocked(window.signoff.workflows.write).mock.calls[0][1] as never as { spec: { approval_mode: string; min_approvals: number } }
  expect(written.spec.approval_mode).toBe('threshold')
  expect(written.spec.min_approvals).toBe(2)
})

it('saves the adr workflow section', async () => {
  vi.mocked(window.signoff.workflows.read).mockResolvedValue({
    spec: { required_approvers: [], min_approvals: 1 },
    plan: { required_approvers: [], min_approvals: 1 },
    adr: { required_approvers: [], min_approvals: 1 },
  } as never)
  vi.mocked(window.signoff.workflows.write).mockResolvedValue(undefined as never)
  render(<ReviewerSettings vaultPath="/v" onClose={() => {}} />)
  const adrSection = (await screen.findByRole('heading', { name: 'ADR' })).closest('section') as HTMLElement
  fireEvent.change(within(adrSection).getByLabelText('ADR approvers'), { target: { value: 'arch@o.c' } })
  fireEvent.click(screen.getByRole('button', { name: /save/i }))
  await waitFor(() => expect(window.signoff.workflows.write).toHaveBeenCalled())
  const written = vi.mocked(window.signoff.workflows.write).mock.calls[0][1] as never as { adr: { required_approvers: string[] } }
  expect(written.adr.required_approvers).toEqual(['arch@o.c'])
})

it('persists require_diagram per document type', async () => {
  render(<ReviewerSettings vaultPath="/v" onClose={() => {}} />)
  await waitFor(() => screen.getByDisplayValue('lead@org.com'))
  // Toggle the Spec "Require a diagram" checkbox on.
  const specSection = (await screen.findByRole('heading', { name: 'Spec' })).closest('section') as HTMLElement
  fireEvent.click(within(specSection).getByLabelText(/require a diagram/i))
  fireEvent.click(screen.getByRole('button', { name: /save/i }))
  await waitFor(() => expect(window.signoff.workflows.write).toHaveBeenCalledWith('/v', expect.objectContaining({
    spec: expect.objectContaining({ require_diagram: true }),
    plan: expect.objectContaining({ require_diagram: false }),
  })))
})
