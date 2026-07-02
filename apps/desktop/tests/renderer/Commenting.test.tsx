import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DocumentPane } from '@renderer/components/DocumentPane'
import { DiscussionRail } from '@renderer/components/DiscussionRail'

const md = '# Title\n\n## Goals\n\nsome body text\n'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(window.signoff.document.read).mockResolvedValue(md)
  vi.mocked(window.signoff.comments.read).mockResolvedValue({ version: 1, threads: [] })
  vi.mocked(window.signoff.comments.addThread).mockResolvedValue({ version: 1, threads: [] })
})

describe('in-document commenting', () => {
  it('shows an add-comment button on each heading and raises a request for that section', async () => {
    const onComment = vi.fn()
    render(<DocumentPane vaultPath="/v" feature="f" type="spec" onComment={onComment} />)
    const btn = await screen.findByRole('button', { name: /comment on goals/i })
    fireEvent.click(btn)
    expect(onComment).toHaveBeenCalledWith(expect.objectContaining({ slug: 'goals', text: 'Goals' }))
  })

  it('does not render heading comment buttons when onComment is absent', async () => {
    render(<DocumentPane vaultPath="/v" feature="f" type="spec" />)
    await screen.findByRole('heading', { name: 'Goals' })
    expect(screen.queryByRole('button', { name: /comment on goals/i })).toBeNull()
  })
})

describe('DiscussionRail — inline comment request', () => {
  it('anchors to the section and prefills the selected text as a quote', async () => {
    const { rerender } = render(
      <DiscussionRail vaultPath="/v" feature="f" type="spec" markdown={md} openRequest={null} />,
    )
    // With no comments yet, no section is listed; the composer still shows,
    // anchored to the first heading by default.
    await screen.findByPlaceholderText(/add a comment on/i)

    rerender(
      <DiscussionRail
        vaultPath="/v"
        feature="f"
        type="spec"
        markdown={md}
        openRequest={{ slug: 'goals', text: 'Goals', quote: 'some body text', nonce: 1 }}
      />,
    )

    const composer = await screen.findByPlaceholderText(/add a comment on goals/i)
    await waitFor(() => expect((composer as HTMLTextAreaElement).value).toContain('> some body text'))

    fireEvent.change(composer, { target: { value: '> some body text\n\nneeds detail' } })
    fireEvent.click(screen.getByRole('button', { name: /^post$/i }))
    await waitFor(() =>
      expect(window.signoff.comments.addThread).toHaveBeenCalledWith(
        '/v',
        'f',
        'spec',
        'goals',
        3,
        '> some body text\n\nneeds detail',
      ),
    )
  })
})
