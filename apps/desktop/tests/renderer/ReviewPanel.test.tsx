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
  vi.mocked(window.signoff.vault.author).mockResolvedValue({ name: 'Me', email: 'me@o.c' })
  vi.mocked(window.signoff.document.isStale).mockResolvedValue(false)
  vi.mocked(window.signoff.review.action).mockResolvedValue({ pushed: false })
  vi.mocked(window.signoff.vault.getRemote).mockResolvedValue(null)
  vi.mocked(window.signoff.project.readClaudeMd).mockResolvedValue(null)
})

it('shows Start review when the current reviewer is pending', async () => {
  render(<ReviewPanel vaultPath="/v" feature="f" type="spec" derivedStatus="pending" record={record({})} workflow={workflow} onActionComplete={() => {}} />)
  await waitFor(() => screen.getByRole('button', { name: /start review/i }))
})

it('shows Approve + Request changes once in review', async () => {
  render(<ReviewPanel vaultPath="/v" feature="f" type="spec" derivedStatus="in_review" record={record({ 'me@o.c': { status: 'in_review', at: 't' } })} workflow={workflow} onActionComplete={() => {}} />)
  await waitFor(() => screen.getByRole('button', { name: /^approve$/i }))
  expect(screen.getByRole('button', { name: /request changes/i })).toBeInTheDocument()
})

it('ignores a rapid double-click on Start review (single action dispatched)', async () => {
  // action never resolves so the first call stays in flight across the 2nd click
  vi.mocked(window.signoff.review.action).mockImplementation(
    () => new Promise(() => { /* never resolves */ })
  )
  render(<ReviewPanel vaultPath="/v" feature="f" type="spec" derivedStatus="pending" record={record({})} workflow={workflow} onActionComplete={() => {}} />)
  const btn = await screen.findByRole('button', { name: /start review/i })
  fireEvent.click(btn)
  fireEvent.click(btn)
  await waitFor(() => expect(window.signoff.review.action).toHaveBeenCalledTimes(1))
})

it('a non-member cannot act', async () => {
  vi.mocked(window.signoff.vault.author).mockResolvedValue({ name: 'X', email: 'x@o.c' })
  render(<ReviewPanel vaultPath="/v" feature="f" type="spec" derivedStatus="pending" record={record({})} workflow={workflow} onActionComplete={() => {}} />)
  await waitFor(() => screen.getByText('me@o.c'))
  expect(screen.queryByRole('button', { name: /start review/i })).not.toBeInTheDocument()
})

describe('ReviewPanel status display', () => {
  it('shows a loading state while the record is undefined', () => {
    render(
      <ReviewPanel vaultPath="/v" feature="user-auth" type="spec" derivedStatus="not_found" record={undefined} workflow={workflow} onActionComplete={() => {}} />
    )
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows the pending status and required approvers', async () => {
    render(
      <ReviewPanel vaultPath="/v" feature="user-auth" type="spec" derivedStatus="pending" record={record({})} workflow={workflow} onActionComplete={() => {}} />
    )
    expect(screen.getByText(/awaiting approval/i)).toBeInTheDocument()
    await waitFor(() => screen.getByText('me@o.c'))
  })

  it('shows the approved status', () => {
    render(
      <ReviewPanel vaultPath="/v" feature="user-auth" type="spec" derivedStatus="approved" record={record({ 'me@o.c': { status: 'approved', at: 't' } }, 'approved')} workflow={workflow} onActionComplete={() => {}} />
    )
    expect(screen.getAllByText(/approved/i).length).toBeGreaterThan(0)
  })

  it('shows Not Submitted when there is no record', () => {
    render(
      <ReviewPanel vaultPath="/v" feature="user-auth" type="spec" derivedStatus="not_found" record={null} workflow={workflow} onActionComplete={() => {}} />
    )
    expect(screen.getByText(/not submitted/i)).toBeInTheDocument()
  })

  it('renders the review history from the record', () => {
    const rec: ApprovalRecord = {
      ...record({}),
      history: [{ action: 'submitted', by: 'dev@o.c', at: '2026-06-27T10:00:00Z', message: null }],
    }
    render(
      <ReviewPanel vaultPath="/v" feature="user-auth" type="spec" derivedStatus="pending" record={rec} workflow={workflow} onActionComplete={() => {}} />
    )
    expect(screen.getByText(/review history/i)).toBeInTheDocument()
    expect(screen.getAllByText(/submitted/i).length).toBeGreaterThan(0)
  })

  it('header pill shows "In Review" when derivedStatus="in_review" even if record.status="approved"', () => {
    // record has reviewers that would normally show "approved" status,
    // but derivedStatus overrides the header pill to show "In Review"
    render(
      <ReviewPanel
        vaultPath="/v"
        feature="user-auth"
        type="spec"
        derivedStatus="in_review"
        record={record({ 'me@o.c': { status: 'approved', at: 't' } }, 'approved')}
        workflow={workflow}
        onActionComplete={() => {}}
      />
    )
    expect(screen.getByText(/in review/i)).toBeInTheDocument()
  })
})

describe('inline note composer for approve/request_changes', () => {
  it('clicking Approve reveals a textarea with note placeholder', async () => {
    render(
      <ReviewPanel
        vaultPath="/v" feature="f" type="spec"
        derivedStatus="in_review"
        record={record({ 'me@o.c': { status: 'in_review', at: 't' } })}
        workflow={workflow}
        onActionComplete={() => {}}
      />
    )
    await waitFor(() => screen.getByRole('button', { name: /^approve$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }))
    await waitFor(() => screen.getByPlaceholderText(/note/i))
    expect(screen.getByPlaceholderText(/note/i)).toBeInTheDocument()
  })

  it('typing a note and confirming calls review.action with the note', async () => {
    const onDone = vi.fn()
    render(
      <ReviewPanel
        vaultPath="/v" feature="f" type="spec"
        derivedStatus="in_review"
        record={record({ 'me@o.c': { status: 'in_review', at: 't' } })}
        workflow={workflow}
        onActionComplete={onDone}
      />
    )
    await waitFor(() => screen.getByRole('button', { name: /^approve$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }))
    await waitFor(() => screen.getByPlaceholderText(/note/i))
    fireEvent.change(screen.getByPlaceholderText(/note/i), { target: { value: 'my note' } })
    fireEvent.click(screen.getAllByRole('button', { name: /^approve$/i })[0])
    await waitFor(() => expect(window.signoff.review.action).toHaveBeenCalledWith('/v', 'f', 'spec', 'approve', 'my note'))
  })

  it('clicking Request changes then confirming with empty note calls with null', async () => {
    render(
      <ReviewPanel
        vaultPath="/v" feature="f" type="spec"
        derivedStatus="in_review"
        record={record({ 'me@o.c': { status: 'in_review', at: 't' } })}
        workflow={workflow}
        onActionComplete={() => {}}
      />
    )
    await waitFor(() => screen.getByRole('button', { name: /request changes/i }))
    fireEvent.click(screen.getByRole('button', { name: /request changes/i }))
    await waitFor(() => screen.getByPlaceholderText(/note/i))
    // Leave textarea empty
    fireEvent.click(screen.getByRole('button', { name: /request changes/i }))
    await waitFor(() => expect(window.signoff.review.action).toHaveBeenCalledWith('/v', 'f', 'spec', 'request_changes', null))
  })

  it('Cancel closes the composer without submitting', async () => {
    render(
      <ReviewPanel
        vaultPath="/v" feature="f" type="spec"
        derivedStatus="in_review"
        record={record({ 'me@o.c': { status: 'in_review', at: 't' } })}
        workflow={workflow}
        onActionComplete={() => {}}
      />
    )
    await waitFor(() => screen.getByRole('button', { name: /^approve$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }))
    await waitFor(() => screen.getByPlaceholderText(/note/i))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await waitFor(() => screen.getByRole('button', { name: /^approve$/i }))
    expect(window.signoff.review.action).not.toHaveBeenCalled()
  })

  it('keeps the composer open with the note and shows an error when review.action rejects', async () => {
    vi.mocked(window.signoff.review.action).mockRejectedValueOnce(new Error('only lead@o.c may review'))
    render(
      <ReviewPanel vaultPath="/v" feature="f" type="spec" derivedStatus="in_review"
        record={record({ 'me@o.c': { status: 'in_review', at: 't' } })} workflow={workflow} onActionComplete={() => {}} />
    )
    await waitFor(() => screen.getByRole('button', { name: /^approve$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }))
    await waitFor(() => screen.getByPlaceholderText(/note/i))
    fireEvent.change(screen.getByPlaceholderText(/note/i), { target: { value: 'keep me' } })
    fireEvent.click(screen.getAllByRole('button', { name: /^approve$/i })[0])
    await waitFor(() => screen.getByText(/only lead@o\.c may review/i))
    expect((screen.getByPlaceholderText(/note/i) as HTMLTextAreaElement).value).toBe('keep me')
  })

  it('closes the composer when the reviewer is no longer in_review', async () => {
    const { rerender } = render(
      <ReviewPanel vaultPath="/v" feature="f" type="spec" derivedStatus="in_review"
        record={record({ 'me@o.c': { status: 'in_review', at: 't' } })} workflow={workflow} onActionComplete={() => {}} />
    )
    await waitFor(() => screen.getByRole('button', { name: /^approve$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }))
    await waitFor(() => screen.getByPlaceholderText(/note/i))
    rerender(
      <ReviewPanel vaultPath="/v" feature="f" type="spec" derivedStatus="approved"
        record={record({ 'me@o.c': { status: 'approved', at: 't' } }, 'approved')} workflow={workflow} onActionComplete={() => {}} />
    )
    await waitFor(() => expect(screen.queryByPlaceholderText(/note/i)).not.toBeInTheDocument())
  })
})

describe('Reviewer roster with acted/awaiting status', () => {
  it('shows progress summary and per-reviewer acted vs awaiting status', async () => {
    const multiWorkflow: WorkflowConfig = {
      required_approvers: ['a@o.c', 'b@o.c', 'c@o.c'],
      min_approvals: 2,
    }
    const rec: ApprovalRecord = {
      document: 'docs/a.md',
      feature: 'f',
      type: 'spec',
      workflow: 'spec',
      status: 'in_review',
      reviewers: {
        'a@o.c': { status: 'approved', at: '2026-06-28T10:00:00Z' },
        'b@o.c': { status: 'in_review', at: '2026-06-28T11:00:00Z' },
      },
      history: [],
    }
    render(
      <ReviewPanel
        vaultPath="/v"
        feature="f"
        type="spec"
        derivedStatus="in_review"
        record={rec}
        workflow={multiWorkflow}
        onActionComplete={() => {}}
      />
    )
    // All three emails render
    await waitFor(() => screen.getByText('a@o.c'))
    expect(screen.getByText('b@o.c')).toBeInTheDocument()
    expect(screen.getByText('c@o.c')).toBeInTheDocument()

    // Status labels for each reviewer
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText('In review')).toBeInTheDocument()
    expect(screen.getByText('Awaiting review')).toBeInTheDocument()

    // Progress summary: 1 of 3 approved
    expect(screen.getByText(/1 of 3 approved/i)).toBeInTheDocument()
  })
})

describe('initial data fetch error handling', () => {
  it('still renders and is usable when author/getRemote/readClaudeMd reject', async () => {
    vi.mocked(window.signoff.vault.author).mockRejectedValue(new Error('no author'))
    vi.mocked(window.signoff.vault.getRemote).mockRejectedValue(new Error('no remote'))
    vi.mocked(window.signoff.project.readClaudeMd).mockRejectedValue(new Error('no claude'))
    render(
      <ReviewPanel vaultPath="/v" feature="user-auth" type="spec" derivedStatus="pending" record={record({})} workflow={workflow} onActionComplete={() => {}} />
    )
    // The panel renders its status section despite every side fetch failing.
    expect(screen.getByText(/awaiting approval/i)).toBeInTheDocument()
    await waitFor(() => screen.getByText('me@o.c'))
    // Falls back to the configure-remote hint instead of crashing.
    await waitFor(() => screen.getByText(/configure a remote/i))
  })
})

describe('Vault access section', () => {
  it('shows the vault clone URL for reviewers when a remote is set', async () => {
    vi.mocked(window.signoff.vault.getRemote).mockResolvedValue('git@github.com:org/proj-signoff.git')
    render(
      <ReviewPanel vaultPath="/v" feature="user-auth" type="spec" derivedStatus="pending" record={record({})} workflow={workflow} onActionComplete={() => {}} />
    )
    await waitFor(() => screen.getByText('git@github.com:org/proj-signoff.git'))
    expect(screen.getByText(/reviewers clone this repo/i)).toBeInTheDocument()
  })

  it('shows a configure hint when no remote is set', async () => {
    vi.mocked(window.signoff.vault.getRemote).mockResolvedValue(null)
    render(
      <ReviewPanel vaultPath="/v" feature="user-auth" type="spec" derivedStatus="pending" record={record({})} workflow={workflow} onActionComplete={() => {}} />
    )
    await waitFor(() => screen.getByText(/configure a remote/i))
  })

  it('shows Project CLAUDE.md detected when readClaudeMd returns content', async () => {
    vi.mocked(window.signoff.project.readClaudeMd).mockResolvedValue('# Project instructions')
    render(
      <ReviewPanel vaultPath="/v" feature="user-auth" type="spec" derivedStatus="pending" record={record({})} workflow={workflow} onActionComplete={() => {}} />
    )
    await waitFor(() => screen.getByText(/project claude\.md detected/i))
  })

  it('does not show CLAUDE.md indicator when readClaudeMd returns null', async () => {
    vi.mocked(window.signoff.project.readClaudeMd).mockResolvedValue(null)
    render(
      <ReviewPanel vaultPath="/v" feature="user-auth" type="spec" derivedStatus="pending" record={record({})} workflow={workflow} onActionComplete={() => {}} />
    )
    await waitFor(() => screen.getByText(/awaiting approval/i))
    expect(screen.queryByText(/project claude\.md detected/i)).not.toBeInTheDocument()
  })
})

describe('missingDiagram prop', () => {
  const diagramRecord: ApprovalRecord = {
    document: 'docs/x-plan.md', feature: 'x', type: 'plan', workflow: 'plan', status: 'in_review',
    reviewers: { 'me@o.c': { status: 'in_review', at: 't' } },
    history: [{ action: 'submitted', by: 'a@o.c', at: 't', message: null }],
  }

  it('shows a diagram-required notice and disables Approve when missingDiagram is true', async () => {
    render(
      <ReviewPanel
        vaultPath="/v" feature="x" type="plan"
        record={diagramRecord} derivedStatus="in_review"
        workflow={{ required_approvers: ['me@o.c'], min_approvals: 1 }}
        missingDiagram
        onActionComplete={vi.fn()}
      />
    )
    await waitFor(() => screen.getByText(/diagram required/i))
    expect(screen.getByText(/diagram required/i)).toBeInTheDocument()
    await waitFor(() => screen.getByRole('button', { name: /^approve$/i }))
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeDisabled()
  })

  it('does not disable Request changes when missingDiagram is true', async () => {
    render(
      <ReviewPanel
        vaultPath="/v" feature="x" type="plan"
        record={diagramRecord} derivedStatus="in_review"
        workflow={{ required_approvers: ['me@o.c'], min_approvals: 1 }}
        missingDiagram
        onActionComplete={vi.fn()}
      />
    )
    await waitFor(() => screen.getByRole('button', { name: /request changes/i }))
    expect(screen.getByRole('button', { name: /request changes/i })).not.toBeDisabled()
  })
})
