import React, { useState } from 'react'
import type { FeatureEntry, ApprovalStatus } from '@shared/ipc-types'
import { Logo } from './Logo'
import { humanizeFeature } from '../lib/feature'
import { CategorySwatch } from './CategorySwatch'
import { groupByCategory, matchesTagFilter, allTags } from '../lib/grouping'

type DocType = 'spec' | 'plan'
type Status = ApprovalStatus | 'not_found'
type GroupBy = 'feature' | 'status' | 'category'
type StatusFilter = ApprovalStatus | 'all'

interface Props {
  vaultName: string
  features: FeatureEntry[]
  selected: { feature: string } | null
  onSelect: (feature: string) => void
  onSync: () => void
  onSwitchVault?: () => void
  /** True for features that arrived since the vault was last seen and haven't been opened. */
  isNew?: (feature: string) => boolean
  /** Opens the category-management modal (wired by App). */
  onManageCategories?: () => void
}

function statusLabel(status: Status): string {
  if (status === 'pending') return 'Pending'
  if (status === 'in_review') return 'In review'
  if (status === 'approved') return 'Approved'
  if (status === 'rejected') return 'Changes requested'
  return 'Open'
}

function statusIcon(status: Status): string {
  if (status === 'pending') return '⏳'
  if (status === 'in_review') return '🔄'
  if (status === 'approved') return '✅'
  if (status === 'rejected') return '❌'
  return '○'
}

/** Solid dot color for a status (used in filter chips + group headers). */
function statusDot(status: Status): string {
  if (status === 'pending') return 'bg-railfg/40'
  if (status === 'in_review') return 'bg-wait'
  if (status === 'approved') return 'bg-ok'
  if (status === 'rejected') return 'bg-stop'
  return 'bg-railfg/30'
}

/** Tinted badge classes for a per-document status pill on a feature row. */
function statusTint(status: Status): string {
  if (status === 'pending') return 'bg-railfg/10 text-railfg/55'
  if (status === 'in_review') return 'bg-wait/20 text-wait'
  if (status === 'approved') return 'bg-ok/20 text-ok'
  if (status === 'rejected') return 'bg-stop/20 text-stop'
  return 'bg-railfg/10 text-railfg/40'
}

const STATUS_ORDER: ApprovalStatus[] = ['rejected', 'in_review', 'pending', 'approved', 'not_found']

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'in_review', label: 'In review' },
  { key: 'rejected', label: 'Changes' },
  { key: 'approved', label: 'Approved' },
]

const DOC_TYPES: DocType[] = ['spec', 'plan']

/** The statuses of a feature's existing documents (drops not_found). */
function featureStatuses(f: FeatureEntry): ApprovalStatus[] {
  return DOC_TYPES.map((t) => f[t]).filter((s): s is ApprovalStatus => s !== 'not_found')
}

/** Most urgent status across a feature's docs — used to group by status. */
function primaryStatus(f: FeatureEntry): ApprovalStatus {
  const s = featureStatuses(f)
  if (s.includes('rejected')) return 'rejected'
  if (s.includes('in_review')) return 'in_review'
  if (s.includes('pending')) return 'pending'
  if (s.includes('approved')) return 'approved'
  return 'not_found'
}

function FeatureGlyph(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.25">
      <path d="M2.5 5l5.5-2.5L13.5 5 8 7.5 2.5 5z" strokeLinejoin="round" />
      <path d="M2.5 8L8 10.5 13.5 8M2.5 11L8 13.5 13.5 11" strokeLinejoin="round" />
    </svg>
  )
}

export function Sidebar({
  vaultName,
  features,
  selected,
  onSelect,
  onSync,
  onSwitchVault,
  isNew,
  onManageCategories,
}: Props): React.ReactElement {
  const [groupBy, setGroupBy] = useState<GroupBy>('feature')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [activeTags, setActiveTags] = useState<string[]>([])

  const counts: Record<StatusFilter, number> = {
    all: features.length,
    pending: features.filter((f) => featureStatuses(f).includes('pending')).length,
    in_review: features.filter((f) => featureStatuses(f).includes('in_review')).length,
    rejected: features.filter((f) => featureStatuses(f).includes('rejected')).length,
    approved: features.filter((f) => featureStatuses(f).includes('approved')).length,
    not_found: 0,
  }

  const q = query.trim().toLowerCase()
  const filtered = features.filter(
    (f) =>
      (statusFilter === 'all' || featureStatuses(f).includes(statusFilter)) &&
      matchesTagFilter(f, activeTags) &&
      (q === '' || f.name.toLowerCase().includes(q) || humanizeFeature(f.name).toLowerCase().includes(q))
  )
  const filtering = q !== '' || statusFilter !== 'all' || activeTags.length > 0

  function featureRow(f: FeatureEntry): React.ReactElement {
    const isSelected = selected?.feature === f.name
    const types = DOC_TYPES.filter((t) => f[t] !== 'not_found')
    const fresh = isNew?.(f.name) ?? false
    return (
      <button
        key={f.name}
        onClick={() => onSelect(f.name)}
        aria-label={f.name}
        title={humanizeFeature(f.name)}
        className={`group relative w-full flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-md text-[13px] transition-colors ${
          isSelected ? 'bg-railfg/[0.12] text-railfg' : 'text-railfg/65 hover:bg-railfg/[0.06] hover:text-railfg/90'
        }`}
      >
        {isSelected && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-iris" />}
        <span className={isSelected ? 'text-railfg/80' : 'text-railfg/40'}>
          <FeatureGlyph />
        </span>
        <span className={`truncate flex-1 text-left ${fresh && !isSelected ? 'font-semibold text-railfg/95' : ''}`}>
          {humanizeFeature(f.name)}
        </span>
        {fresh && (
          <span
            title="New — not opened yet"
            aria-label="New"
            className="shrink-0 w-1.5 h-1.5 rounded-full bg-iris"
          />
        )}
        {f.category && (
          <span title={f.category.name} className="shrink-0">
            <CategorySwatch color={f.category.color} />
          </span>
        )}
        {f.tags.slice(0, 2).map((t) => (
          <span
            key={t}
            className="shrink-0 text-[9px] leading-none px-1 py-0.5 rounded bg-railfg/[0.08] text-railfg/50"
          >
            {t}
          </span>
        ))}
        {f.tags.length > 2 && (
          <span className="shrink-0 text-[9px] text-railfg/35">+{f.tags.length - 2}</span>
        )}
        <span className="flex items-center gap-1 shrink-0">
          {types.map((t) => (
            <span
              key={t}
              title={`${t} — ${statusLabel(f[t])}`}
              className={`w-4 h-4 grid place-items-center rounded text-[9px] font-bold leading-none ${statusTint(f[t])}`}
            >
              {t.charAt(0).toUpperCase()}
            </span>
          ))}
        </span>
      </button>
    )
  }

  const tabClass = (active: boolean): string =>
    `text-[10.5px] font-medium px-1.5 py-0.5 rounded transition-colors ${
      active ? 'bg-railfg/[0.12] text-railfg/90' : 'text-railfg/35 hover:text-railfg/70'
    }`

  return (
    <aside className="w-60 min-w-60 bg-rail text-railfg flex flex-col h-full select-none">
      <header className="h-14 px-2.5 flex items-center justify-between gap-1 border-b border-railfg/[0.08]">
        <button
          onClick={onSwitchVault}
          title="Switch project"
          className="group flex items-center gap-2.5 min-w-0 px-1 py-1 rounded-md hover:bg-railfg/[0.08] transition-colors"
        >
          <Logo size={24} className="shrink-0" />
          <span className="font-semibold text-[13px] text-railfg/95 truncate" title={vaultName}>
            {vaultName}
          </span>
          <svg viewBox="0 0 12 12" className="w-3 h-3 text-railfg/30 group-hover:text-railfg/60 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 4.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          onClick={onSync}
          title="Pull the latest documents from the vault"
          className="text-[11px] font-medium text-railfg/45 hover:text-railfg transition-colors px-2 py-1 rounded-md hover:bg-railfg/[0.08] shrink-0"
        >
          Sync
        </button>
      </header>

      {features.length > 0 && (
        <div className="px-3 pt-3 pb-2 border-b border-railfg/[0.06] space-y-2.5">
          {/* Search — the primary finder when there are hundreds of features */}
          <div className="relative">
            <svg
              viewBox="0 0 16 16"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-railfg/35 pointer-events-none"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5L14 14" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              role="searchbox"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a feature…"
              className="w-full rounded-md bg-railfg/[0.07] text-railfg placeholder:text-railfg/35 text-[12.5px] pl-8 pr-7 py-1.5 focus:outline-none focus:bg-railfg/[0.12] focus:ring-1 focus:ring-railfg/20 transition-colors"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 grid place-items-center rounded text-railfg/40 hover:text-railfg hover:bg-railfg/10 transition-colors"
              >
                <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>

          {/* Status filters with live counts — jump straight to what needs action */}
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => {
              const active = statusFilter === f.key
              return (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`flex items-center gap-1.5 text-[11px] font-medium pl-1.5 pr-2 py-1 rounded-md transition-colors ${
                    active
                      ? 'bg-railfg/[0.14] text-railfg'
                      : 'text-railfg/45 hover:bg-railfg/[0.06] hover:text-railfg/80'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${f.key === 'all' ? 'bg-railfg/40' : statusDot(f.key)}`} />
                  {f.label}
                  <span className={active ? 'text-railfg/60' : 'text-railfg/30'}>{counts[f.key]}</span>
                </button>
              )
            })}
          </div>

          {/* Arrange-by toggle */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-railfg/30 mr-auto">Arrange by</span>
            <button onClick={() => setGroupBy('feature')} className={tabClass(groupBy === 'feature')}>
              Feature
            </button>
            <button onClick={() => setGroupBy('status')} className={tabClass(groupBy === 'status')}>
              Status
            </button>
            <button onClick={() => setGroupBy('category')} className={tabClass(groupBy === 'category')}>
              Category
            </button>
            {onManageCategories && (
              <button onClick={onManageCategories} title="Manage categories" aria-label="Manage categories" className={tabClass(false)}>
                ⚙
              </button>
            )}
          </div>

          {/* Tag filter — narrow the list to features carrying every selected tag */}
          {allTags(features).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {allTags(features).map(({ tag, count }) => {
                const active = activeTags.includes(tag)
                return (
                  <button
                    key={tag}
                    onClick={() =>
                      setActiveTags((prev) => (active ? prev.filter((t) => t !== tag) : [...prev, tag]))
                    }
                    className={`text-[10.5px] font-medium px-1.5 py-0.5 rounded transition-colors ${
                      active ? 'bg-iris/20 text-iris' : 'text-railfg/45 hover:bg-railfg/[0.06] hover:text-railfg/80'
                    }`}
                  >
                    #{tag} <span className="opacity-60">{count}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-2 pb-3 pt-2">
        {features.length === 0 && (
          <p className="text-[12px] leading-relaxed text-railfg/35 px-3 py-2">
            No features yet. They appear here once Claude publishes a spec or plan.
          </p>
        )}

        {features.length > 0 && filtered.length === 0 && (
          <div className="px-3 py-6 text-center">
            <p className="text-[12.5px] text-railfg/40">No features match.</p>
            <button
              onClick={() => {
                setQuery('')
                setStatusFilter('all')
              }}
              className="mt-2 text-[11.5px] font-medium text-iris hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}

        {filtering && filtered.length > 0 && (
          <p className="text-[10.5px] text-railfg/30 px-3 pb-1.5">
            {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
          </p>
        )}

        {groupBy === 'feature' && filtered.map((f) => featureRow(f))}

        {groupBy === 'status' &&
          STATUS_ORDER.map((s) => {
            const group = filtered.filter((f) => primaryStatus(f) === s)
            if (group.length === 0) return null
            return (
              <div key={s} className="mb-3">
                <p className="flex items-center gap-1.5 text-[10.5px] font-semibold text-railfg/40 px-3 mb-1">
                  <span className="text-[11px]">{statusIcon(s)}</span>
                  {statusLabel(s)}
                </p>
                {group.map((f) => featureRow(f))}
              </div>
            )
          })}

        {groupBy === 'category' &&
          groupByCategory(filtered).map((g) => (
            <div key={g.category?.id ?? '__uncategorized'} className="mb-3">
              <p className="flex items-center gap-1.5 text-[10.5px] font-semibold text-railfg/40 px-3 mb-1">
                {g.category ? (
                  <CategorySwatch color={g.category.color} />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-railfg/20" />
                )}
                {g.category?.name ?? 'Uncategorized'}
              </p>
              {g.features.map((f) => featureRow(f))}
            </div>
          ))}
      </nav>

      <footer className="px-4 py-2.5 border-t border-railfg/[0.08] text-[10.5px] tracking-wide text-railfg/30">
        Signoff · review &amp; approve
      </footer>
    </aside>
  )
}
