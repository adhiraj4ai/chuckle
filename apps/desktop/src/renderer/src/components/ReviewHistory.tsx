import React from 'react'
import type { ApprovalHistoryEntry } from '@shared/ipc-types'

interface Props {
  history: ApprovalHistoryEntry[]
}

const actionLabel: Record<ApprovalHistoryEntry['action'], string> = {
  submitted: 'Submitted',
  resubmitted: 'Resubmitted',
  approved: 'Approved',
  rejected: 'Changes requested',
}

function dotColor(action: ApprovalHistoryEntry['action']): string {
  if (action === 'approved') return 'bg-ok'
  if (action === 'rejected') return 'bg-stop'
  return 'bg-ink/30'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function ReviewHistory({ history }: Props): React.ReactElement {
  if (history.length === 0) return <></>
  return (
    <section className="px-5 py-4">
      <h3 className="text-[11px] font-semibold text-ink/45 mb-3">Review history</h3>
      <ol className="relative space-y-3">
        {history.map((entry, i) => (
          <li key={i} className="relative pl-5">
            <span
              className={`absolute left-0 top-1.5 w-2 h-2 rounded-full ring-4 ring-white ${dotColor(entry.action)}`}
            />
            {i < history.length - 1 && (
              <span className="absolute left-[3.5px] top-3.5 bottom-[-12px] w-px bg-line" />
            )}
            <div className="text-[13px] leading-tight">
              <span className="font-medium text-ink">{actionLabel[entry.action]}</span>
              <span className="text-ink/45"> · {entry.by}</span>
              <span className="text-ink/35"> · {formatDate(entry.at)}</span>
            </div>
            {entry.message && (
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink/60 bg-mist border border-line rounded-md px-2.5 py-1.5">
                {entry.message}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
