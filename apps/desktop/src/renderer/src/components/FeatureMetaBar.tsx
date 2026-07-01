import React, { useEffect, useState } from 'react'
import type { Category, FeatureEntry, Tier } from '@shared/ipc-types'
import { normalizeTags, TIER_KEYS } from '@shared/ipc-types'
import { CategorySwatch } from './CategorySwatch'

interface Props {
  vaultPath: string
  feature: FeatureEntry
  onChanged: () => void
}

export function FeatureMetaBar({ vaultPath, feature, onChanged }: Props): React.ReactElement {
  const [categories, setCategories] = useState<Category[]>([])
  const [draft, setDraft] = useState('')
  const [editingTicket, setEditingTicket] = useState(false)
  const [tId, setTId] = useState('')
  const [tUrl, setTUrl] = useState('')

  useEffect(() => {
    void window.signoff.categories.list(vaultPath).then(setCategories)
  }, [vaultPath])

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
    <div className="flex items-center gap-2 flex-wrap px-4 py-2 border-b border-border text-[12.5px]">
      {feature.category && <CategorySwatch color={feature.category.color} />}
      <select
        value={feature.category?.id ?? ''}
        onChange={(e) => void pickCategory(e.target.value)}
        className="rounded-md bg-fg/[0.05] text-fg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-iris/40"
      >
        <option value="">Uncategorized</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <div role="group" aria-label="Tier" className="flex items-center gap-0.5 rounded-md bg-fg/[0.05] px-1 py-0.5">
        {TIER_KEYS.map((t) => (
          <label key={t} className="flex items-center cursor-pointer">
            <input
              type="radio"
              name={`tier-${feature.name}`}
              value={t}
              checked={feature.tier === t}
              onChange={() => void pickTier(t)}
              className="sr-only"
            />
            <span
              className={`text-[11px] px-1.5 py-0.5 rounded capitalize select-none transition-colors ${
                feature.tier === t
                  ? 'bg-fg/[0.12] text-fg/90 font-medium'
                  : 'text-fg/45 hover:text-fg/70'
              }`}
            >
              {t}
            </span>
          </label>
        ))}
      </div>

      {/* Ticket chip / editor */}
      {feature.ticket ? (
        <span className="flex items-center gap-1 text-[11px] rounded bg-fg/[0.06] px-1.5 py-0.5">
          <button
            onClick={() => feature.ticket?.url ? window.signoff.openExternal(feature.ticket.url) : undefined}
            className="text-fg/80 hover:text-fg"
          >
            {feature.ticket.id}{feature.ticket.url ? ' ↗' : ''}
          </button>
          <button
            aria-label="Clear ticket"
            onClick={() => void commitTicket(null)}
            className="text-fg/40 hover:text-stop"
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
            className="w-20 rounded-md bg-fg/[0.05] text-fg px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-iris/40"
          />
          <input
            aria-label="Ticket url"
            value={tUrl}
            onChange={(e) => setTUrl(e.target.value)}
            className="w-32 rounded-md bg-fg/[0.05] text-fg px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-iris/40"
          />
          <button
            onClick={() => { void commitTicket({ id: tId, url: tUrl || undefined }); setEditingTicket(false) }}
            className="text-[11px] px-1.5 py-0.5 rounded bg-fg/[0.08] text-fg/80 hover:text-fg"
          >
            Save ticket
          </button>
        </span>
      ) : (
        <button
          onClick={() => setEditingTicket(true)}
          className="text-[11px] text-fg/45 hover:text-fg/70"
        >
          Add ticket
        </button>
      )}

      <div className="flex items-center gap-1 flex-wrap">
        {feature.tags.map((t) => (
          <span key={t} className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-fg/[0.06] text-fg/70">
            {t}
            <button
              aria-label={`Remove ${t}`}
              onClick={() => void commitTags(feature.tags.filter((x) => x !== t))}
              className="text-fg/40 hover:text-stop"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add tag…"
          className="w-24 rounded-md bg-fg/[0.05] text-fg px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-iris/40"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              void commitTags([...feature.tags, draft.trim()])
              setDraft('')
            }
          }}
        />
      </div>
    </div>
  )
}
