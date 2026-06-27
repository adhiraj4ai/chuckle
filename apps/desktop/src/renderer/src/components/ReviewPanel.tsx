import React from 'react'
import type { ApprovalRecord, DocumentType, WorkflowConfig } from '@shared/ipc-types'
import { ReviewHistory } from './ReviewHistory'
import { ApproveBar } from './ApproveBar'

type Status = string

function statusLabel(status: Status): string {
  if (status === 'pending') return 'Awaiting Approval'
  if (status === 'approved') return 'Approved'
  if (status === 'rejected') return 'Changes Requested'
  return 'Not Submitted'
}

function statusPill(status: Status): string {
  if (status === 'pending') return 'bg-wait-soft text-wait'
  if (status === 'approved') return 'bg-ok-soft text-ok'
  if (status === 'rejected') return 'bg-stop-soft text-stop'
  return 'bg-mist text-ink/45'
}

function statusDot(status: Status): string {
  if (status === 'pending') return 'bg-wait'
  if (status === 'approved') return 'bg-ok'
  if (status === 'rejected') return 'bg-stop'
  return 'bg-ink/30'
}

interface Props {
  vaultPath: string
  feature: string
  type: DocumentType
  /** undefined = still loading, null = no record yet */
  record: ApprovalRecord | null | undefined
  workflow: WorkflowConfig | undefined
  onActionComplete: () => void
}

export function ReviewPanel({
  vaultPath,
  feature,
  type,
  record,
  workflow,
  onActionComplete,
}: Props): React.ReactElement {
  const status = record?.status ?? 'not_found'
  const submittedBy = record?.history.find((e) => e.action === 'submitted')?.by

  return (
    <aside className="w-80 min-w-80 border-l border-line bg-white flex flex-col h-full overflow-y-auto">
      <div className="px-5 py-4 border-b border-line">
        <h2 className="text-[11px] font-semibold text-ink/45 mb-3">Review</h2>
        {record === undefined ? (
          <p className="text-[12px] text-ink/40">Loading…</p>
        ) : (
          <div className="space-y-2.5">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium ${statusPill(status)}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusDot(status)}`} />
              {statusLabel(status)}
            </span>
            {submittedBy && (
              <p className="text-[12px] text-ink/50">
                Submitted by <span className="text-ink/75">{submittedBy}</span>
              </p>
            )}
            {workflow && status !== 'approved' && (
              <p className="text-[11.5px] leading-relaxed text-ink/45">
                Needs {workflow.min_approvals} approval
                {workflow.min_approvals === 1 ? '' : 's'}
                {workflow.required_approvers.length > 0 && (
                  <>
                    {' '}from{' '}
                    <span className="text-ink/65">{workflow.required_approvers.join(', ')}</span>
                  </>
                )}
              </p>
            )}
          </div>
        )}
      </div>

      {record !== undefined && (
        <ApproveBar
          vaultPath={vaultPath}
          feature={feature}
          type={type}
          status={record?.status ?? 'not_found'}
          onActionComplete={onActionComplete}
        />
      )}

      {record && record.history.length > 0 && <ReviewHistory history={record.history} />}
    </aside>
  )
}
