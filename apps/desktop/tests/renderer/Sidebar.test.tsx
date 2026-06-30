import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { Sidebar } from '@renderer/components/Sidebar'
import type { FeatureEntry } from '@shared/ipc-types'

const features: FeatureEntry[] = [
  { name: 'user-auth', spec: 'pending', plan: 'approved', category: null, tags: [] },
  { name: 'payment-gw', spec: 'rejected', plan: 'not_found', category: null, tags: [] },
]

describe('Sidebar', () => {
  it('renders vault name', () => {
    render(<Sidebar vaultName="project-alpha" features={[]} selected={null} onSelect={() => {}} onSync={() => {}} />)
    expect(screen.getByText('project-alpha')).toBeInTheDocument()
  })

  it('renders one row per feature with a human-readable name', () => {
    render(<Sidebar vaultName="vault" features={features} selected={null} onSelect={() => {}} onSync={() => {}} />)
    expect(screen.getByText('User Auth')).toBeInTheDocument()
    expect(screen.getByText('Payment Gw')).toBeInTheDocument()
  })

  it('uppercases known acronyms when humanizing', () => {
    render(<Sidebar vaultName="vault" features={[{ name: 'mcp-server', spec: 'pending', plan: 'not_found', category: null, tags: [] }]} selected={null} onSelect={() => {}} onSync={() => {}} />)
    expect(screen.getByText('MCP Server')).toBeInTheDocument()
  })

  it('calls onSelect with the feature slug when a feature is clicked', () => {
    const onSelect = vi.fn()
    render(<Sidebar vaultName="vault" features={features} selected={null} onSelect={onSelect} onSync={() => {}} />)
    fireEvent.click(screen.getByText('User Auth'))
    expect(onSelect).toHaveBeenCalledWith('user-auth')
  })

  it('filters features by the search box', () => {
    render(<Sidebar vaultName="vault" features={features} selected={null} onSelect={() => {}} onSync={() => {}} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'pay' } })
    expect(screen.getByText('Payment Gw')).toBeInTheDocument()
    expect(screen.queryByText('User Auth')).not.toBeInTheDocument()
  })

  it('filters features by status when a status chip is selected', () => {
    render(<Sidebar vaultName="vault" features={features} selected={null} onSelect={() => {}} onSync={() => {}} />)
    // payment-gw has no approved doc; user-auth's plan is approved
    fireEvent.click(screen.getByText('Approved'))
    expect(screen.getByText('User Auth')).toBeInTheDocument()
    expect(screen.queryByText('Payment Gw')).not.toBeInTheDocument()
  })

  it('surfaces in_review docs via the In review filter chip and tints them', () => {
    const fs: FeatureEntry[] = [
      { name: 'user-auth', spec: 'in_review', plan: 'not_found', category: null, tags: [] },
      { name: 'payment-gw', spec: 'approved', plan: 'not_found', category: null, tags: [] },
    ]
    render(<Sidebar vaultName="vault" features={fs} selected={null} onSelect={() => {}} onSync={() => {}} />)
    // The In review chip exists with a count of 1
    const chip = screen.getByText('In review')
    expect(chip).toBeInTheDocument()
    // The S badge for the in_review doc is NOT the neutral fallback — carries the wait/amber tint
    const badge = screen.getByTitle('spec — In review')
    expect(badge.className).toContain('text-wait')
    expect(badge.className).not.toContain('text-railfg/40')
    // Filtering by In review surfaces only user-auth
    fireEvent.click(chip)
    expect(screen.getByText('User Auth')).toBeInTheDocument()
    expect(screen.queryByText('Payment Gw')).not.toBeInTheDocument()
  })

  it('shows an empty state with a clear-filters action when nothing matches', () => {
    render(<Sidebar vaultName="vault" features={features} selected={null} onSelect={() => {}} onSync={() => {}} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    expect(screen.getByText('No features match.')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Clear filters'))
    expect(screen.getByText('User Auth')).toBeInTheDocument()
  })

  it('renders a category group and an Uncategorized group when arranging by category', () => {
    const fs: FeatureEntry[] = [
      { name: 'user-auth', spec: 'pending', plan: 'not_found', category: { id: 'backend', name: 'Backend', color: 'blue' }, tags: [] },
      { name: 'payment-gw', spec: 'pending', plan: 'not_found', category: null, tags: [] },
    ]
    render(<Sidebar vaultName="vault" features={fs} selected={null} onSelect={() => {}} onSync={() => {}} />)
    fireEvent.click(screen.getByText('Category'))
    expect(screen.getByText('Backend')).toBeInTheDocument()
    expect(screen.getByText('Uncategorized')).toBeInTheDocument()
  })

  it('filters by a tag chip (AND with other filters)', () => {
    const fs: FeatureEntry[] = [
      { name: 'user-auth', spec: 'pending', plan: 'not_found', category: null, tags: ['security'] },
      { name: 'payment-gw', spec: 'pending', plan: 'not_found', category: null, tags: [] },
    ]
    render(<Sidebar vaultName="vault" features={fs} selected={null} onSelect={() => {}} onSync={() => {}} />)
    fireEvent.click(screen.getByText(/#security/))
    expect(screen.getByText('User Auth')).toBeInTheDocument()
    expect(screen.queryByText('Payment Gw')).not.toBeInTheDocument()
  })

  it('calls onManageCategories when the manage affordance is clicked', () => {
    const onManageCategories = vi.fn()
    render(<Sidebar vaultName="vault" features={features} selected={null} onSelect={() => {}} onSync={() => {}} onManageCategories={onManageCategories} />)
    fireEvent.click(screen.getByLabelText('Manage categories'))
    expect(onManageCategories).toHaveBeenCalled()
  })

  it('calls onSync when Sync clicked', () => {
    const onSync = vi.fn()
    render(<Sidebar vaultName="vault" features={[]} selected={null} onSelect={() => {}} onSync={onSync} />)
    fireEvent.click(screen.getByText('Sync'))
    expect(onSync).toHaveBeenCalled()
  })

  it('marks features reported as new with a "New" indicator and leaves others unmarked', () => {
    render(
      <Sidebar
        vaultName="vault"
        features={features}
        selected={null}
        onSelect={() => {}}
        onSync={() => {}}
        isNew={(name) => name === 'payment-gw'}
      />
    )
    const newRow = screen.getByLabelText('payment-gw')
    const seenRow = screen.getByLabelText('user-auth')
    expect(within(newRow).getByTitle('New — not opened yet')).toBeInTheDocument()
    expect(within(seenRow).queryByTitle('New — not opened yet')).not.toBeInTheDocument()
  })
})
