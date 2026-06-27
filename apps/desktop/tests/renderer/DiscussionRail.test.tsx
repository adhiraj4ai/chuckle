import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DiscussionRail } from '@renderer/components/DiscussionRail'

const docMd = '# Title\n\n## Goals\n\ntext\n'
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(window.chuckle.comments.read).mockResolvedValue({ version: 1, threads: [] })
  vi.mocked(window.chuckle.comments.addThread).mockResolvedValue({ version: 1, threads: [{ id: 't1', section: 'goals', line: 3, resolved: false, comments: [{ id: 'c1', by: 'me@o.c', at: 't', body: 'q' }] }] })
})
it('lists sections and adds a comment thread', async () => {
  render(<DiscussionRail vaultPath="/v" feature="f" type="spec" markdown={docMd} />)
  await waitFor(() => screen.getByText('Goals'))
  fireEvent.click(screen.getByRole('button', { name: /comment on goals/i }))
  fireEvent.change(screen.getByPlaceholderText(/comment/i), { target: { value: 'q' } })
  fireEvent.click(screen.getByRole('button', { name: /^post$/i }))
  await waitFor(() => expect(window.chuckle.comments.addThread).toHaveBeenCalledWith('/v', 'f', 'spec', 'goals', 3, 'q'))
})
