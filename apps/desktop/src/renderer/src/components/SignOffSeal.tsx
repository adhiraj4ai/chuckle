import React from 'react'
import type { ApprovalStatus, DocumentType } from '@shared/ipc-types'

type Status = ApprovalStatus | 'not_found'

interface Props {
  status: Status
  type: DocumentType
  /** Approvals collected so far, for the caption + quorum pips. */
  approvedCount?: number
  /** Approvals required to sign off (workflow.min_approvals). */
  totalRequired?: number
}

interface Look {
  ring: string // border + text color for the stamp
  glow: string // gradient tint behind the seal
  dashed: boolean
  filled: string // faint fill inside the ring
  icon: string
  stamp: [string, string]
  caption: string
}

/**
 * The signature element: review state rendered as a stamped sign-off seal.
 * Dashed iris ring while a decision is pending; a solid green seal once signed
 * off; red when changes are requested. Slightly rotated, like a real stamp.
 */
export function SignOffSeal({ status, type, approvedCount, totalRequired }: Props): React.ReactElement {
  const look: Look =
    status === 'approved'
      ? { ring: 'border-ok text-ok', glow: 'from-ok-soft', dashed: false, filled: 'bg-ok-soft', icon: '✓', stamp: ['Signed', 'off'], caption: 'Signed off' }
      : status === 'rejected'
        ? { ring: 'border-stop text-stop', glow: 'from-stop-soft', dashed: false, filled: 'bg-stop-soft', icon: '↺', stamp: ['Changes', 'needed'], caption: 'Changes requested' }
        : status === 'in_review'
          ? { ring: 'border-iris text-iris-ink', glow: 'from-iris-soft', dashed: true, filled: 'bg-iris-soft', icon: '✒', stamp: ['In', 'review'], caption: 'In review' }
          : status === 'pending'
            ? { ring: 'border-iris text-iris-ink', glow: 'from-iris-soft', dashed: true, filled: 'bg-iris-soft', icon: '✒', stamp: ['Awaiting', 'sign-off'], caption: 'Awaiting sign-off' }
            : { ring: 'border-border text-faint', glow: 'from-app', dashed: true, filled: '', icon: '·', stamp: ['Not', 'submitted'], caption: 'Not submitted' }

  const showQuorum = typeof totalRequired === 'number' && totalRequired > 0 && status !== 'not_found'
  const done = approvedCount ?? 0

  return (
    <div className={`flex flex-col items-center gap-3 px-5 pt-6 pb-5 border-b border-border bg-gradient-to-b ${look.glow} to-transparent`}>
      <div
        className={`relative w-[116px] h-[116px] rounded-full grid place-items-center text-center -rotate-6 border-2 ${look.dashed ? 'border-dashed' : ''} ${look.ring} ${look.filled}`}
      >
        <div className={`absolute inset-[7px] rounded-full border ${look.dashed ? 'border-dashed' : ''} ${look.ring} opacity-40`} />
        <div className="relative leading-none">
          <div className="text-[22px] mb-1" aria-hidden>{look.icon}</div>
          <div className="font-mono text-[11px] font-bold leading-[1.35]">
            {look.stamp[0]}
            <br />
            {look.stamp[1]}
          </div>
          <div className="font-mono text-[8.5px] tracking-wide opacity-70 mt-1.5">{type[0].toUpperCase() + type.slice(1)}</div>
        </div>
      </div>

      <div className="text-center">
        <div className="text-[15px] font-semibold text-fg">{look.caption}</div>
        {showQuorum && (
          <>
            <div className="text-[12px] text-muted mt-0.5 tabular-nums">
              {done} of {totalRequired} approval{totalRequired === 1 ? '' : 's'}
            </div>
            <div className="flex items-center justify-center gap-1.5 mt-2">
              {Array.from({ length: totalRequired }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-5 rounded-full ${i < done ? 'bg-ok' : 'bg-border'}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
