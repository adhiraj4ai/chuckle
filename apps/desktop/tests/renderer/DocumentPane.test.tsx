import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { DocumentPane } from '@renderer/components/DocumentPane'
import type { ApprovalRecord } from '@shared/ipc-types'

const mockRecord: ApprovalRecord = {
  document: 'spec.md',
  feature: 'user-auth',
  type: 'spec',
  workflow: 'spec',
  status: 'pending',
  history: [
    { action: 'submitted', by: 'dev@org.com', at: '2026-06-27T10:00:00Z', message: null },
  ],
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(window.chuckle.document.read).mockResolvedValue('# User Auth Spec\n\nThis is the spec.')
  vi.mocked(window.chuckle.document.getApproval).mockResolvedValue(mockRecord)
  vi.mocked(window.chuckle.workflows.read).mockResolvedValue({
    spec: { required_approvers: ['arch@org.com'], min_approvals: 1 },
    plan: { required_approvers: ['lead@org.com'], min_approvals: 1 },
  })
})

describe('DocumentPane', () => {
  it('shows loading state initially', () => {
    render(<DocumentPane vaultPath="/vault" feature="user-auth" type="spec" />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders document heading from markdown', async () => {
    render(<DocumentPane vaultPath="/vault" feature="user-auth" type="spec" />)
    await waitFor(() => screen.getByRole('heading', { name: /user auth spec/i }))
  })

  it('shows the human-readable feature name and a document-type tab in the header', async () => {
    render(<DocumentPane vaultPath="/vault" feature="user-auth" type="spec" />)
    await waitFor(() => screen.getByText('User Auth'))
    // the type tab "spec" (lowercase text, capitalized via CSS) sits beside the name
    expect(screen.getAllByText('spec').length).toBeGreaterThan(0)
  })
})
