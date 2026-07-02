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

  it('highlights a commented quote in the document and opens its thread on click', async () => {
    vi.mocked(window.signoff.comments.read).mockResolvedValue({
      version: 1,
      threads: [
        { id: 't1', section: 'goals', line: 3, resolved: false, quote: 'some body text', comments: [{ id: 'c1', by: 'me@o.c', at: 't', body: 'x' }] },
      ],
    })
    const onFocusSection = vi.fn()
    render(<DocumentPane vaultPath="/v" feature="f" type="spec" commentsVersion={1} onFocusSection={onFocusSection} />)
    const mark = await waitFor(() => {
      const m = document.querySelector('mark.sio-comment')
      if (!m) throw new Error('highlight not rendered yet')
      return m
    })
    expect(mark).toHaveAttribute('data-section', 'goals')
    fireEvent.click(mark)
    expect(onFocusSection).toHaveBeenCalledWith('goals')
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
    // The selection shows as a quote chip in the composer (not prefilled body).
    await screen.findByText(/some body text/)

    fireEvent.change(composer, { target: { value: 'needs detail' } })
    fireEvent.click(screen.getByRole('button', { name: /^post$/i }))
    await waitFor(() =>
      expect(window.signoff.comments.addThread).toHaveBeenCalledWith(
        '/v',
        'f',
        'spec',
        'goals',
        3,
        'needs detail',
        'some body text',
      ),
    )
  })
})
