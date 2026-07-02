import React, { useState } from 'react'
import type { Category, FeatureEntry, Tier } from '@shared/ipc-types'
import { normalizeTags, TIER_KEYS } from '@shared/ipc-types'
import { CategorySwatch } from './CategorySwatch'

interface Props {
  vaultPath: string
  feature: FeatureEntry
  /** Single source of truth from useVault — reloaded on refresh so a deleted
   *  category never lingers here. */
  categories: Category[]
  onChanged: () => void
  onManageCategories?: () => void
}

const LABEL = 'font-mono text-[11px] font-semibold tracking-wide text-muted'
const ROW_KEY = 'text-[12px] text-muted shrink-0 w-[54px]'

/** Feature metadata — category, weight, tags, ticket — as a vertical block in
 *  the inspector (replaces the old horizontal meta bar). */
export function DetailsPanel({ vaultPath, feature, categories, onChanged, onManageCategories }: Props): React.ReactElement {
  const [draft, setDraft] = useState('')
  const [editingTicket, setEditingTicket] = useState(false)
  const [tId, setTId] = useState('')
  const [tUrl, setTUrl] = useState('')

  async function pickCategory(id: string): Promise<void> {
    await window.signoff.features.setCategory(vaultPath, feature.name, id || null)
    onChanged()
  }
  async function commitTags(next: string[]): Promise<void> {
    await window.signoff.features.setTags(vaultPath, feature.name, normalizeTags(next))
    onChanged()
  }
  async function pickTier(next: Tier): Promise<void> {
    await window.signoff.features.setTier(vaultPath, feature.name, next)
    onChanged()
  }
  async function commitTicket(ticket: { id: string; url?: string } | null): Promise<void> {
    await window.signoff.features.setTicket(vaultPath, feature.name, ticket)
    onChanged()
  }

  return (
    <div className="px-5 py-4 border-b border-border">
      <div className="flex items-center justify-between mb-3">
        <span className={LABEL}>Details</span>
        {onManageCategories && (
          <button
            onClick={onManageCategories}
            className="text-[11px] font-medium text-iris hover:text-iris-ink transition rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/40"
          >
            Manage
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {/* Category */}
        <div className="flex items-center gap-3">
          <span className={ROW_KEY}>Category</span>
          <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
            {feature.category && <CategorySwatch color={feature.category.color} />}
            <div className="relative">
              <select
                value={feature.category?.id ?? ''}
                onChange={(e) => void pickCategory(e.target.value)}
                aria-label="Category"
                className="appearance-none rounded-md border border-border bg-surface text-fg text-[12.5px] font-medium pl-2.5 pr-7 py-1.5 hover:border-iris/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-iris/40 cursor-pointer"
              >
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-faint text-[10px]">▾</span>
            </div>
          </div>
        </div>

        {/* Weight */}
        <div className="flex items-center gap-3">
          <span className={ROW_KEY}>Weight</span>
          <div role="group" aria-label="Weight" className="flex-1 flex justify-end">
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              {TIER_KEYS.map((t) => (
                <label key={t} className="cursor-pointer">
                  <input
                    type="radio"
                    name={`tier-${feature.name}`}
                    value={t}
                    checked={feature.tier === t}
                    onChange={() => void pickTier(t)}
                    className="sr-only peer"
                  />
                  <span
                    className={`block text-[11.5px] capitalize select-none px-2.5 py-1.5 border-r border-border last:border-r-0 transition-colors ${
                      feature.tier === t ? 'bg-iris-soft text-iris-ink font-semibold' : 'text-muted hover:text-fg/80'
                    }`}
                  >
                    {t}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="flex items-start gap-3">
          <span className={`${ROW_KEY} pt-1.5`}>Tags</span>
          <div className="flex-1 flex flex-wrap items-center justify-end gap-1.5">
            {feature.tags.map((t) => (
              <span key={t} className="flex items-center gap-1 text-[11px] rounded-full bg-app border border-border px-2.5 py-0.5 text-muted">
                {t}
                <button
                  aria-label={`Remove ${t}`}
                  onClick={() => void commitTags(feature.tags.filter((x) => x !== t))}
                  className="text-faint hover:text-stop leading-none"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="+ Add"
              aria-label="Add tag"
              className="w-16 rounded-full bg-transparent border border-dashed border-border text-iris placeholder:text-iris/70 px-2.5 py-0.5 text-[11px] focus:outline-none focus-visible:ring-2 focus-visible:ring-iris/40"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draft.trim()) {
                  void commitTags([...feature.tags, draft.trim()])
                  setDraft('')
                }
              }}
            />
          </div>
        </div>

        {/* Ticket */}
        <div className="flex items-center gap-3">
          <span className={ROW_KEY}>Ticket</span>
          <div className="flex-1 flex justify-end min-w-0">
            {feature.ticket ? (
              <span className="flex items-center gap-1.5 text-[12px] font-medium rounded-md bg-iris-soft border border-iris/15 px-2.5 py-1 max-w-full">
                <button
                  onClick={() => (feature.ticket?.url ? window.signoff.openExternal(feature.ticket.url) : undefined)}
                  className="text-iris-ink hover:underline truncate"
                >
                  {feature.ticket.id}
                  {feature.ticket.url ? ' ↗' : ''}
                </button>
                <button
                  aria-label="Clear ticket"
                  onClick={() => void commitTicket(null)}
                  className="text-iris/50 hover:text-stop leading-none"
                >
                  ×
                </button>
              </span>
            ) : editingTicket ? (
              <span className="flex items-center gap-1">
                <input
                  aria-label="Ticket id"
                  value={tId}
                  onChange={(e) => setTId(e.target.value)}
                  placeholder="ID"
                  className="w-16 rounded-md bg-surface border border-border text-fg px-2 py-1 text-[11px] focus:outline-none focus-visible:ring-2 focus-visible:ring-iris/40"
                />
                <input
                  aria-label="Ticket url"
                  value={tUrl}
                  onChange={(e) => setTUrl(e.target.value)}
                  placeholder="URL"
                  className="w-24 rounded-md bg-surface border border-border text-fg px-2 py-1 text-[11px] focus:outline-none focus-visible:ring-2 focus-visible:ring-iris/40"
                />
                <button
                  onClick={() => {
                    void commitTicket({ id: tId, url: tUrl || undefined })
                    setEditingTicket(false)
                  }}
                  className="text-[11px] px-2 py-1 rounded-md bg-iris text-white font-medium hover:brightness-95"
                >
                  Save
                </button>
              </span>
            ) : (
              <button
                onClick={() => setEditingTicket(true)}
                className="text-[11.5px] text-iris hover:text-iris-ink font-medium"
              >
                + Add ticket
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
