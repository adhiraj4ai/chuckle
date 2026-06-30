import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategoryManager } from '@renderer/components/CategoryManager'

beforeEach(() => {
  window.signoff.categories.list = vi.fn().mockResolvedValue([])
  window.signoff.categories.upsert = vi.fn().mockResolvedValue({ pushed: true })
  window.signoff.categories.remove = vi.fn().mockResolvedValue({ pushed: true })
})

describe('CategoryManager', () => {
  it('creates a category from a typed name', async () => {
    render(<CategoryManager vaultPath="/v" features={[]} open onClose={() => {}} onChanged={() => {}} />)
    await userEvent.type(screen.getByPlaceholderText(/new category/i), 'Backend')
    await userEvent.click(screen.getByRole('button', { name: /add/i }))
    await waitFor(() =>
      expect(window.signoff.categories.upsert).toHaveBeenCalledWith(
        '/v',
        expect.objectContaining({ id: 'backend', name: 'Backend' }),
      ),
    )
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <CategoryManager vaultPath="/v" features={[]} open={false} onClose={() => {}} onChanged={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
