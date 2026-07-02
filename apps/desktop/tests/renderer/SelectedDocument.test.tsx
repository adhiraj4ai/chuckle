import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SelectedDocument } from '@renderer/App'
import type { DocumentType, FeatureEntry } from '@shared/ipc-types'

/** A promise we resolve manually so we can control response ordering. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

const docTypes: { type: DocumentType; status: 'pending' }[] = [{ type: 'spec', status: 'pending' }]

const entry = (name: string): FeatureEntry => ({
  name, spec: 'pending', plan: 'not_found', adr: 'not_found', category: null, tags: [], tier: 'standard', ticket: null, paths: {},
})

beforeEach(() => {
  vi.resetAllMocks()
  // Record/workflow are not under test here; resolve them immediately.
  vi.mocked(window.signoff.document.getApproval).mockResolvedValue(null)
  vi.mocked(window.signoff.workflows.read).mockResolvedValue(undefined)
  // The DiscussionRail (shown via the Discussion toggle) reads comments.
  vi.mocked(window.signoff.comments.read).mockResolvedValue({ version: 1, threads: [] })
  // ReviewPanel mounts initially (Discussion is off) and fetches these.
  vi.mocked(window.signoff.vault.author).mockResolvedValue({ name: 'Me', email: 'me@o.c' })
  vi.mocked(window.signoff.vault.getRemote).mockResolvedValue(null)
  vi.mocked(window.signoff.project.readClaudeMd).mockResolvedValue(null)
})

describe('SelectedDocument stale-response race', () => {
  it('ignores an older document.read response that resolves after a newer selection', async () => {
    const oldRead = deferred<string>()
    const newRead = deferred<string>()
    // document.read is called by both SelectedDocument and DocumentPane, so we
    // route by the `feature` argument rather than by call order. Each feature's
    // promise resolves only when we tell it to, so we control ordering.
    vi.mocked(window.signoff.document.read).mockImplementation((_v, feature) =>
      feature === 'old' ? oldRead.promise : newRead.promise
    )

    const { rerender } = render(
      <SelectedDocument
        vaultPath="/v" featureEntry={entry('old')} type="spec" docTypes={docTypes} categories={[]} reloadKey={0}
        onSelectType={() => {}} onActionComplete={() => {}} onChanged={() => {}}
      />
    )

    // Switch selection before the first read resolves.
    rerender(
      <SelectedDocument
        vaultPath="/v" featureEntry={entry('new')} type="spec" docTypes={docTypes} categories={[]} reloadKey={0}
        onSelectType={() => {}} onActionComplete={() => {}} onChanged={() => {}}
      />
    )

    // Newer selection resolves first, then the stale older one resolves late.
    newRead.resolve('# New Heading\n\nnew content\n')
    oldRead.resolve('# Old Heading\n\nold content\n')

    // Open the Discussion panel: it renders the markdown owned by
    // SelectedDocument's read effect (the one with the stale-response guard).
    // The composer anchors to the document's first heading, so its placeholder
    // reflects which markdown won.
    fireEvent.click(screen.getByRole('button', { name: /discussion/i }))

    // The discussion must reflect the NEWER selection; the stale older response
    // must not overwrite it (SelectedDocument's `alive` guard).
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/add a comment on new heading/i)).toBeInTheDocument()
    )
    expect(screen.queryByPlaceholderText(/add a comment on old heading/i)).not.toBeInTheDocument()
  })
})
