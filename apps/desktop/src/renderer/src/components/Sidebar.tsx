import React, { useState } from 'react'
import type { FeatureEntry, ApprovalStatus } from '@shared/ipc-types'

type DocType = 'spec' | 'plan'
type Status = ApprovalStatus | 'not_found'
type GroupBy = 'feature' | 'status'

interface Props {
  vaultName: string
  features: FeatureEntry[]
  selected: { feature: string; type: DocType } | null
  onSelect: (feature: string, type: DocType) => void
  onSync: () => void
  onSwitchVault?: () => void
}

interface DocEntry {
  feature: string
  type: DocType
  status: ApprovalStatus
}

function statusIcon(status: Status): string {
  if (status === 'pending') return '⏳'
  if (status === 'approved') return '✅'
  if (status === 'rejected') return '❌'
  return '○'
}

function statusLabel(status: Status): string {
  if (status === 'pending') return 'In review'
  if (status === 'approved') return 'Approved'
  if (status === 'rejected') return 'Changes requested'
  return 'Open'
}

const STATUS_ORDER: ApprovalStatus[] = ['pending', 'rejected', 'approved', 'not_found']

function TypeIcon({ type }: { type: DocType }): React.ReactElement {
  if (type === 'spec') {
    // document with text lines
    return (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.25">
        <path d="M4 2.5h4.5L12 6v7a1 1 0 01-1 1H4a1 1 0 01-1-1V3.5a1 1 0 011-1z" strokeLinejoin="round" />
        <path d="M8.5 2.5V6H12" strokeLinejoin="round" />
        <path d="M5.5 9h5M5.5 11h3.5" strokeLinecap="round" />
      </svg>
    )
  }
  // plan: checklist
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.25">
      <path d="M2.5 4.6l1.1 1.1L5.8 3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 10.1l1.1 1.1 2.2-2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 5h5M8.5 10.5h5" strokeLinecap="round" />
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
}: Props): React.ReactElement {
  const [groupBy, setGroupBy] = useState<GroupBy>('feature')

  const docs: DocEntry[] = features.flatMap((f) =>
    (['spec', 'plan'] as DocType[])
      .filter((t) => f[t] !== 'not_found')
      .map((t) => ({ feature: f.name, type: t, status: f[t] as ApprovalStatus }))
  )

  function docRow(d: DocEntry, showFeature: boolean): React.ReactElement {
    const isSelected = selected?.feature === d.feature && selected?.type === d.type
    return (
      <button
        key={`${d.feature}/${d.type}`}
        onClick={() => onSelect(d.feature, d.type)}
        aria-label={d.type}
        title={`${d.feature} ${d.type} — ${statusLabel(d.status)}`}
        className={`group relative w-full flex items-center gap-2.5 pl-3 pr-2.5 py-1.5 rounded-md text-[13px] transition-colors ${
          isSelected ? 'bg-white/[0.12] text-white' : 'text-white/60 hover:bg-white/[0.06] hover:text-white/90'
        }`}
      >
        {isSelected && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-iris" />}
        <span className={isSelected ? 'text-white/80' : 'text-white/40'}>
          <TypeIcon type={d.type} />
        </span>
        {showFeature ? (
          <span className="truncate">
            {d.feature}
            <span className="text-white/30">/</span>
            {d.type}
          </span>
        ) : (
          <span className="capitalize">{d.type}</span>
        )}
        <span className="ml-auto text-[11px] leading-none" title={statusLabel(d.status)}>
          {statusIcon(d.status)}
        </span>
      </button>
    )
  }

  const tabClass = (active: boolean): string =>
    `text-[10.5px] font-medium px-1.5 py-0.5 rounded transition-colors ${
      active ? 'bg-white/[0.12] text-white/90' : 'text-white/35 hover:text-white/70'
    }`

  return (
    <aside className="w-60 min-w-60 bg-ink text-white flex flex-col h-full select-none">
      <header className="h-14 px-2.5 flex items-center justify-between gap-1 border-b border-white/[0.08]">
        <button
          onClick={onSwitchVault}
          title="Switch project"
          className="group flex items-center gap-2.5 min-w-0 px-1 py-1 rounded-md hover:bg-white/[0.08] transition-colors"
        >
          <span className="grid place-items-center w-6 h-6 rounded-md bg-iris text-white text-[13px] font-bold shrink-0">
            C
          </span>
          <span className="font-semibold text-[13px] text-white/95 truncate" title={vaultName}>
            {vaultName}
          </span>
          <svg viewBox="0 0 12 12" className="w-3 h-3 text-white/30 group-hover:text-white/60 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 4.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          onClick={onSync}
          title="Pull the latest documents from the vault"
          className="text-[11px] font-medium text-white/45 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-white/[0.08] shrink-0"
        >
          Sync
        </button>
      </header>

      {features.length > 0 && (
        <div className="flex items-center gap-1 px-3 pt-3 pb-1">
          <span className="text-[11px] text-white/30 mr-auto">Arrange by</span>
          <button onClick={() => setGroupBy('feature')} className={tabClass(groupBy === 'feature')}>
            Feature
          </button>
          <button onClick={() => setGroupBy('status')} className={tabClass(groupBy === 'status')}>
            Status
          </button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-2 pb-3 pt-1">
        {features.length === 0 && (
          <p className="text-[12px] leading-relaxed text-white/35 px-3 py-2">
            No documents published yet. They appear here once Claude publishes a spec or plan.
          </p>
        )}

        {groupBy === 'feature' &&
          features.map((f) => {
            const featureDocs = docs.filter((d) => d.feature === f.name)
            return (
              <div key={f.name} className="mb-4">
                <p className="text-[10.5px] font-semibold text-white/40 px-3 mb-1">
                  {f.name}
                </p>
                {featureDocs.map((d) => docRow(d, false))}
              </div>
            )
          })}

        {groupBy === 'status' &&
          STATUS_ORDER.map((s) => {
            const group = docs.filter((d) => d.status === s)
            if (group.length === 0) return null
            return (
              <div key={s} className="mb-4">
                <p className="flex items-center gap-1.5 text-[10.5px] font-semibold text-white/40 px-3 mb-1">
                  <span className="text-[11px]">{statusIcon(s)}</span>
                  {statusLabel(s)}
                </p>
                {group.map((d) => docRow(d, true))}
              </div>
            )
          })}
      </nav>

      <footer className="px-4 py-2.5 border-t border-white/[0.08] text-[10.5px] tracking-wide text-white/30">
        Chuckle · review &amp; approve
      </footer>
    </aside>
  )
}
