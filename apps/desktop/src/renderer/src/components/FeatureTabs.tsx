import React from 'react'
import type { ApprovalStatus, DocumentType } from '@shared/ipc-types'

type Status = ApprovalStatus | 'not_found'

interface Props {
  types: { type: DocumentType; status: Status }[]
  active: DocumentType
  onSelect: (type: DocumentType) => void
}

function dot(status: Status): string {
  if (status === 'pending') return 'bg-wait'
  if (status === 'approved') return 'bg-ok'
  if (status === 'rejected') return 'bg-stop'
  return 'bg-fg/20'
}

/** Spec / Plan tabs for the one feature currently open. */
export function FeatureTabs({ types, active, onSelect }: Props): React.ReactElement {
  return (
    <div className="flex items-center h-11 px-3 bg-app border-b border-border shrink-0">
      <div className="flex items-center gap-1">
        {types.map((t) => {
          const isActive = t.type === active
          return (
            <button
              key={t.type}
              onClick={() => onSelect(t.type)}
              aria-label={t.type}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12.5px] font-medium capitalize transition-colors ${
                isActive ? 'bg-surface text-fg border border-border shadow-panel' : 'text-fg/55 hover:bg-surface/60'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${dot(t.status)}`} />
              {t.type}
            </button>
          )
        })}
      </div>
    </div>
  )
}
