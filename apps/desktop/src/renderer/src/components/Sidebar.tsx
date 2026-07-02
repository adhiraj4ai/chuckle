import React, { useState } from 'react'
import type { FeatureEntry, ApprovalStatus, Category } from '@shared/ipc-types'
import { Logo } from './Logo.js'
import { humanizeFeature } from '../lib/feature.js'
import { CategorySwatch } from './CategorySwatch.js'
import { groupByCategory, matchesTagFilter, allTags } from '../lib/grouping.js'

type DocType = 'spec' | 'plan' | 'adr'
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
  /** All categories defined in the vault — used for the footer count. */
  categories?: Category[]
}

function statusLabel(status: Status): string {
  if (status === 'pending') return 'Pending'
  if (status === 'in_review') return 'In review'
  if (status === 'approved') return 'Approved'
  if (status === 'rejected') return 'Changes requested'
  return 'Open'
}

/** Solid dot color for a status (used in filter chips + group headers). */
function statusDot(status: Status): string {
  if (status === 'pending') return 'bg-wait/60'
  if (status === 'in_review') return 'bg-wait'
  if (status === 'approved') return 'bg-ok'
  if (status === 'rejected') return 'bg-stop'
  return 'bg-railfg/30'
}

/** Tinted badge classes for a per-document status pill on a feature row. */
function statusTint(status: Status): string {
  if (status === 'pending') return 'bg-wait/15 text-wait'
  if (status === 'in_review') return 'bg-wait/25 text-wait'
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

const DOC_TYPES: DocType[] = ['spec', 'plan', 'adr']

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
  categories,
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

  // Count of categories for the footer button. Prefer the explicit prop; if it is
  // absent, fall back to counting the distinct categories present on features.
  const categoryCount =
    categories?.length ??
    new Set(features.map((f) => f.category?.id).filter((id): id is string => id != null)).size

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
        className={`group relative w-full flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-md text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/40 ${
          isSelected
            ? 'bg-iris/[0.14] text-railfg'
            : 'text-railfg/65 hover:bg-railfg/[0.06] hover:text-railfg/90'
        }`}
      >
        {isSelected && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-iris" />}
        <span className={isSelected ? 'text-iris' : 'text-railfg/40'}>
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
        {f.tier !== 'standard' && (
          <span
            title={`${f.tier} tier`}
            aria-label={`${f.tier} tier`}
            className="shrink-0 text-[8.5px] font-semibold tracking-wide px-1 py-0.5 rounded bg-railfg/[0.07] text-railfg/45"
          >
            {f.tier}
          </span>
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
    `flex-1 text-[12px] font-medium px-2 py-1 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/40 ${
      active
        ? 'bg-rail text-iris shadow-sm font-semibold'
        : 'text-railfg/45 hover:text-railfg/80'
    }`

  return (
    <aside className="w-60 min-w-60 bg-rail text-railfg flex flex-col h-full select-none">
      {/* Brand — logo + wordmark, above the project name */}
      <div className="px-3 pt-3.5 pb-1.5 flex items-center gap-2">
        <Logo size={26} className="shrink-0" />
        <span
          className="text-railfg/90 leading-none"
          style={{ fontFamily: "'SignPainter', 'SignPainter-HouseScript', 'Brush Script MT', cursive", fontWeight: 700, fontSize: '24px' }}
        >
          SignOff
        </span>
      </div>
      <header className="h-12 px-2.5 flex items-center justify-between gap-1 border-b border-railfg/[0.08]">
        <button
          onClick={onSwitchVault}
          title="Switch project"
          className="group flex items-center gap-2 min-w-0 px-1.5 py-1 rounded-md hover:bg-railfg/[0.08] transition-colors"
        >
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
              className="w-full rounded-md bg-railfg/[0.07] text-railfg placeholder:text-railfg/35 text-[12.5px] pl-8 pr-7 py-1.5 focus:outline-none focus:bg-railfg/[0.1] focus-visible:ring-2 focus-visible:ring-iris/40 transition-colors"
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
                  className={`flex items-center gap-1.5 text-[11px] font-medium pl-1.5 pr-2 py-1 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/40 ${
                    active
                      ? 'bg-iris text-white'
                      : 'text-railfg/45 hover:bg-railfg/[0.06] hover:text-railfg/80'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      active ? 'bg-white/80' : f.key === 'all' ? 'bg-railfg/40' : statusDot(f.key)
                    }`}
                  />
                  {f.label}
                  <span className={active ? 'text-white/70' : 'text-railfg/30'}>{counts[f.key]}</span>
                </button>
              )
            })}
          </div>

          {/* Arrange-by segmented control */}
          <div className="space-y-1.5">
            <span className="block font-mono text-[10.5px] font-semibold tracking-wide text-railfg/40">
              Arrange by
            </span>
            <div className="flex items-center gap-1 bg-railfg/[0.06] p-1 rounded-lg">
              <button onClick={() => setGroupBy('feature')} className={tabClass(groupBy === 'feature')}>
                Feature
              </button>
              <button onClick={() => setGroupBy('status')} className={tabClass(groupBy === 'status')}>
                Status
              </button>
              <button onClick={() => setGroupBy('category')} className={tabClass(groupBy === 'category')}>
                Category
              </button>
            </div>
          </div>

          {/* Tag filter — narrow the list to features carrying every selected tag */}
          {allTags(features).length > 0 && (
            <div className="space-y-1.5">
              <span className="block font-mono text-[10.5px] font-semibold tracking-wide text-railfg/40">
                Tags
              </span>
              <div className="flex flex-wrap gap-1">
                {allTags(features).map(({ tag, count }) => {
                  const active = activeTags.includes(tag)
                  return (
                    <button
                      key={tag}
                      onClick={() =>
                        setActiveTags((prev) => (active ? prev.filter((t) => t !== tag) : [...prev, tag]))
                      }
                      className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/40 ${
                        active
                          ? 'bg-iris text-white'
                          : 'bg-railfg/[0.06] text-railfg/55 hover:bg-railfg/[0.1] hover:text-railfg/85'
                      }`}
                    >
                      #{tag} <span className="opacity-60">{count}</span>
                    </button>
                  )
                })}
              </div>
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
          <p className="font-mono text-[10px] tracking-wide text-railfg/35 px-3 pb-1.5">
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
                <p className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold tracking-wide text-railfg/40 px-3 mb-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${statusDot(s)}`} />
                  {statusLabel(s)}
                  <span className="ml-1 text-railfg/25 tracking-normal">{group.length}</span>
                </p>
                {group.map((f) => featureRow(f))}
              </div>
            )
          })}

        {groupBy === 'category' &&
          groupByCategory(filtered).map((g) => (
            <div key={g.category?.id ?? '__uncategorized'} className="mb-3">
              <p className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold tracking-wide text-railfg/40 px-3 mb-1">
                {g.category ? (
                  <CategorySwatch color={g.category.color} />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-railfg/20" />
                )}
                {g.category?.name ?? 'Uncategorized'}
                <span className="ml-1 text-railfg/25 tracking-normal">{g.features.length}</span>
              </p>
              {g.features.map((f) => featureRow(f))}
            </div>
          ))}
      </nav>

      <footer className="border-t border-railfg/[0.08]">
        {onManageCategories && (
          <div className="px-2.5 pt-2.5 pb-1">
            <button
              onClick={onManageCategories}
              aria-label="Manage categories"
              className="group w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors hover:bg-railfg/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/40"
            >
              <span className="shrink-0 w-8 h-8 grid place-items-center rounded-md bg-iris/15 text-iris">
                <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1.2" />
                  <rect x="9" y="2.5" width="4.5" height="4.5" rx="1.2" />
                  <rect x="2.5" y="9" width="4.5" height="4.5" rx="1.2" />
                  <rect x="9" y="9" width="4.5" height="4.5" rx="1.2" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-railfg/90 leading-tight">Categories</span>
                <span className="block text-[11px] text-railfg/45 leading-tight">Add, rename, recolor</span>
              </span>
              <span className="shrink-0 text-[11px] font-mono font-semibold text-railfg/40 tabular-nums px-1.5 py-0.5 rounded-full bg-railfg/[0.07]">
                {categoryCount}
              </span>
            </button>
          </div>
        )}
      </footer>
    </aside>
  )
}
