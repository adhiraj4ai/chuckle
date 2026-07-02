import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DetailsPanel } from '@renderer/components/DetailsPanel'
import type { Category, FeatureEntry } from '@shared/ipc-types'

const feature: FeatureEntry = { name: 'user-auth', spec: 'pending', plan: 'not_found', adr: 'not_found', category: null, tags: [], tier: 'standard', ticket: null }
const backend: Category = { id: 'backend', name: 'Backend', color: 'blue' }
const frontend: Category = { id: 'frontend', name: 'Frontend', color: 'green' }

beforeEach(() => {
  window.signoff.features.setCategory = vi.fn().mockResolvedValue({ pushed: true })
  window.signoff.features.setTags = vi.fn().mockResolvedValue({ pushed: true })
  window.signoff.features.setTier = vi.fn().mockResolvedValue({ pushed: true })
  window.signoff.features.setTicket = vi.fn().mockResolvedValue({ pushed: true })
})

describe('DetailsPanel', () => {
  it('assigns a category via the dropdown', async () => {
    render(<DetailsPanel vaultPath="/v" feature={feature} categories={[backend]} onChanged={() => {}} />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'backend')
    await waitFor(() =>
      expect(window.signoff.features.setCategory).toHaveBeenCalledWith('/v', 'user-auth', 'backend'),
    )
  })

  it('clearing the dropdown to Uncategorized sends null', async () => {
    const categorized: FeatureEntry = { ...feature, category: backend }
    render(<DetailsPanel vaultPath="/v" feature={categorized} categories={[backend]} onChanged={() => {}} />)
    await userEvent.selectOptions(screen.getByRole('combobox'), '')
    await waitFor(() =>
      expect(window.signoff.features.setCategory).toHaveBeenCalledWith('/v', 'user-auth', null),
    )
  })

  // Regression: the category picker reads from the `categories` prop (single
  // source of truth in useVault), so a deleted category disappears here as soon
  // as the parent re-renders — it no longer lingers from a one-time fetch.
  it('drops a deleted category from the dropdown when the prop updates', () => {
    const { rerender } = render(
      <DetailsPanel vaultPath="/v" feature={feature} categories={[backend, frontend]} onChanged={() => {}} />,
    )
    expect(screen.getByRole('option', { name: 'Frontend' })).toBeInTheDocument()
    rerender(<DetailsPanel vaultPath="/v" feature={feature} categories={[backend]} onChanged={() => {}} />)
    expect(screen.queryByRole('option', { name: 'Frontend' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Backend' })).toBeInTheDocument()
  })

  it('adds a tag on Enter', async () => {
    render(<DetailsPanel vaultPath="/v" feature={feature} categories={[]} onChanged={() => {}} />)
    await userEvent.type(screen.getByLabelText(/add tag/i), 'security{enter}')
    await waitFor(() =>
      expect(window.signoff.features.setTags).toHaveBeenCalledWith('/v', 'user-auth', ['security']),
    )
  })

  it('shows the current weight and persists a change via features.setTier', async () => {
    const onChanged = vi.fn()
    render(<DetailsPanel vaultPath="/v" feature={feature} categories={[]} onChanged={onChanged} />)
    const heavy = await screen.findByRole('radio', { name: /heavy/i })
    fireEvent.click(heavy)
    await waitFor(() => expect(window.signoff.features.setTier).toHaveBeenCalledWith('/v', 'user-auth', 'heavy'))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('renders a clickable ticket chip that opens the url', () => {
    const withTicket = { ...feature, ticket: { id: 'PROJ-7', url: 'https://t/7' } } as FeatureEntry
    render(<DetailsPanel vaultPath="/v" feature={withTicket} categories={[]} onChanged={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /PROJ-7/ }))
    expect(window.signoff.openExternal).toHaveBeenCalledWith('https://t/7')
  })

  it('saves a ticket via the editor', async () => {
    render(<DetailsPanel vaultPath="/v" feature={feature} categories={[]} onChanged={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /add ticket/i }))
    fireEvent.change(screen.getByLabelText(/ticket id/i), { target: { value: 'PROJ-8' } })
    fireEvent.change(screen.getByLabelText(/ticket url/i), { target: { value: 'https://t/8' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(window.signoff.features.setTicket).toHaveBeenCalledWith('/v', 'user-auth', { id: 'PROJ-8', url: 'https://t/8' }))
  })

  it('opens the category manager from the Manage link', () => {
    const onManage = vi.fn()
    render(<DetailsPanel vaultPath="/v" feature={feature} categories={[]} onChanged={() => {}} onManageCategories={onManage} />)
    fireEvent.click(screen.getByRole('button', { name: /manage/i }))
    expect(onManage).toHaveBeenCalled()
  })
})
