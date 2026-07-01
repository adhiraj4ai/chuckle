import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeatureMetaBar } from '@renderer/components/FeatureMetaBar'
import type { FeatureEntry } from '@shared/ipc-types'

const feature: FeatureEntry = { name: 'user-auth', spec: 'pending', plan: 'not_found', adr: 'not_found', category: null, tags: [], tier: 'standard' }

beforeEach(() => {
  window.signoff.categories.list = vi.fn().mockResolvedValue([{ id: 'backend', name: 'Backend', color: 'blue' }])
  window.signoff.features.setCategory = vi.fn().mockResolvedValue({ pushed: true })
  window.signoff.features.setTags = vi.fn().mockResolvedValue({ pushed: true })
  window.signoff.features.setTier = vi.fn().mockResolvedValue({ pushed: true })
})

describe('FeatureMetaBar', () => {
  it('assigns a category via the dropdown', async () => {
    render(<FeatureMetaBar vaultPath="/v" feature={feature} onChanged={() => {}} />)
    await waitFor(() => screen.getByRole('combobox'))
    await userEvent.selectOptions(screen.getByRole('combobox'), 'backend')
    await waitFor(() =>
      expect(window.signoff.features.setCategory).toHaveBeenCalledWith('/v', 'user-auth', 'backend'),
    )
  })

  it('adds a tag on Enter', async () => {
    render(<FeatureMetaBar vaultPath="/v" feature={feature} onChanged={() => {}} />)
    await userEvent.type(screen.getByPlaceholderText(/add tag/i), 'security{enter}')
    await waitFor(() =>
      expect(window.signoff.features.setTags).toHaveBeenCalledWith('/v', 'user-auth', ['security']),
    )
  })

  it('clearing the dropdown to Uncategorized sends null', async () => {
    const categorized: FeatureEntry = { ...feature, category: { id: 'backend', name: 'Backend', color: 'blue' } }
    render(<FeatureMetaBar vaultPath="/v" feature={categorized} onChanged={() => {}} />)
    await waitFor(() => screen.getByRole('combobox'))
    await userEvent.selectOptions(screen.getByRole('combobox'), '')
    await waitFor(() =>
      expect(window.signoff.features.setCategory).toHaveBeenCalledWith('/v', 'user-auth', null),
    )
  })

  it('shows the current tier and persists a change via features.setTier', async () => {
    const onChanged = vi.fn()
    render(<FeatureMetaBar vaultPath="/v" feature={feature} onChanged={onChanged} />)
    const heavy = await screen.findByRole('radio', { name: /heavy/i })
    fireEvent.click(heavy)
    await waitFor(() => expect(window.signoff.features.setTier).toHaveBeenCalledWith('/v', 'user-auth', 'heavy'))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })
})
