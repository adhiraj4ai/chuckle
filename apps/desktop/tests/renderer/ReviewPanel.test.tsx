import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReviewPanel } from '@renderer/components/ReviewPanel'
import type { ApprovalRecord, WorkflowConfig } from '@shared/ipc-types'

const workflow: WorkflowConfig = { required_approvers: ['me@o.c'], min_approvals: 1 }
function record(reviewers: ApprovalRecord['reviewers'], status: ApprovalRecord['status'] = 'pending'): ApprovalRecord {
  return { document: 'docs/a.md', feature: 'f', type: 'spec', workflow: 'spec', status, reviewers, history: [] }
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(window.chuckle.vault.author).mockResolvedValue({ name: 'Me', email: 'me@o.c' })
  vi.mocked(window.chuckle.document.isStale).mockResolvedValue(false)
  vi.mocked(window.chuckle.review.action).mockResolvedValue({ pushed: false })
})

it('shows Start review when the current reviewer is pending', async () => {
  render(<ReviewPanel vaultPath="/v" feature="f" type="spec" record={record({})} workflow={workflow} onActionComplete={() => {}} />)
  await waitFor(() => screen.getByRole('button', { name: /start review/i }))
})

it('shows Approve + Request changes once in review', async () => {
  render(<ReviewPanel vaultPath="/v" feature="f" type="spec" record={record({ 'me@o.c': { status: 'in_review', at: 't' } })} workflow={workflow} onActionComplete={() => {}} />)
  await waitFor(() => screen.getByRole('button', { name: /^approve$/i }))
  expect(screen.getByRole('button', { name: /request changes/i })).toBeInTheDocument()
})

it('a non-member cannot act', async () => {
  vi.mocked(window.chuckle.vault.author).mockResolvedValue({ name: 'X', email: 'x@o.c' })
  render(<ReviewPanel vaultPath="/v" feature="f" type="spec" record={record({})} workflow={workflow} onActionComplete={() => {}} />)
  await waitFor(() => screen.getByText('me@o.c'))
  expect(screen.queryByRole('button', { name: /start review/i })).not.toBeInTheDocument()
})

describe('ReviewPanel status display', () => {
  it('shows a loading state while the record is undefined', () => {
    render(
      <ReviewPanel vaultPath="/v" feature="user-auth" type="spec" record={undefined} workflow={workflow} onActionComplete={() => {}} />
    )
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows the pending status and required approvers', async () => {
    render(
      <ReviewPanel vaultPath="/v" feature="user-auth" type="spec" record={record({})} workflow={workflow} onActionComplete={() => {}} />
    )
    expect(screen.getByText(/awaiting approval/i)).toBeInTheDocument()
    await waitFor(() => screen.getByText('me@o.c'))
  })

  it('shows the approved status', () => {
    render(
      <ReviewPanel vaultPath="/v" feature="user-auth" type="spec" record={record({ 'me@o.c': { status: 'approved', at: 't' } }, 'approved')} workflow={workflow} onActionComplete={() => {}} />
    )
    expect(screen.getAllByText(/approved/i).length).toBeGreaterThan(0)
  })

  it('shows Not Submitted when there is no record', () => {
    render(
      <ReviewPanel vaultPath="/v" feature="user-auth" type="spec" record={null} workflow={workflow} onActionComplete={() => {}} />
    )
    expect(screen.getByText(/not submitted/i)).toBeInTheDocument()
  })

  it('renders the review history from the record', () => {
    const rec: ApprovalRecord = {
      ...record({}),
      history: [{ action: 'submitted', by: 'dev@o.c', at: '2026-06-27T10:00:00Z', message: null }],
    }
    render(
      <ReviewPanel vaultPath="/v" feature="user-auth" type="spec" record={rec} workflow={workflow} onActionComplete={() => {}} />
    )
    expect(screen.getByText(/review history/i)).toBeInTheDocument()
    expect(screen.getAllByText(/submitted/i).length).toBeGreaterThan(0)
  })
})
