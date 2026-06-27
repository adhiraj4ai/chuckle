import React, { useEffect, useState } from 'react'
import type { ApprovalRecord, ApprovalStatus, DocumentType, ReviewAction, ReviewerStatus, ReviewResult, WorkflowConfig } from '@shared/ipc-types'
import { ReviewHistory } from './ReviewHistory'
import { ReviewerSettings } from './ReviewerSettings'

type Status = string

function statusLabel(status: Status): string {
  if (status === 'pending') return 'Awaiting Approval'
  if (status === 'in_review') return 'In Review'
  if (status === 'approved') return 'Approved'
  if (status === 'rejected') return 'Changes Requested'
  return 'Not Submitted'
}

function statusPill(status: Status): string {
  if (status === 'pending') return 'bg-wait-soft text-wait'
  if (status === 'in_review') return 'bg-wait-soft text-wait'
  if (status === 'approved') return 'bg-ok-soft text-ok'
  if (status === 'rejected') return 'bg-stop-soft text-stop'
  return 'bg-app text-fg/45'
}

function statusDot(status: Status): string {
  if (status === 'pending') return 'bg-wait'
  if (status === 'in_review') return 'bg-wait'
  if (status === 'approved') return 'bg-ok'
  if (status === 'rejected') return 'bg-stop'
  return 'bg-ink/30'
}

function reviewerStatusLabel(status: ReviewerStatus): string {
  if (status === 'pending') return 'Pending'
  if (status === 'in_review') return 'In review'
  if (status === 'approved') return 'Approved'
  if (status === 'changes_requested') return 'Changes requested'
  return 'Pending'
}

function reviewerStatusPill(status: ReviewerStatus): string {
  if (status === 'approved') return 'bg-ok-soft text-ok'
  if (status === 'changes_requested') return 'bg-stop-soft text-stop'
  if (status === 'in_review') return 'bg-wait-soft text-wait'
  return 'bg-app text-fg/45'
}

interface Props {
  vaultPath: string
  feature: string
  type: DocumentType
  /** undefined = still loading, null = no record yet */
  record: ApprovalRecord | null | undefined
  /** Derived document status from the sidebar/vault index (authoritative for header pill). */
  derivedStatus: ApprovalStatus | 'not_found'
  workflow: WorkflowConfig | undefined
  onActionComplete: (result?: ReviewResult) => void
}

export function ReviewPanel({
  vaultPath,
  feature,
  type,
  record,
  derivedStatus,
  workflow,
  onActionComplete,
}: Props): React.ReactElement {
  const submittedBy = record?.history.find((e) => e.action === 'submitted')?.by

  const [authorEmail, setAuthorEmail] = useState<string>('')
  const [showSettings, setShowSettings] = useState(false)
  const [busy, setBusy] = useState(false)
  const [vaultRemote, setVaultRemote] = useState<string | null | undefined>(undefined)
  const [hasClaudeMd, setHasClaudeMd] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    window.chuckle.vault.author(vaultPath).then((a) => {
      if (alive) setAuthorEmail(a.email)
    })
    return () => { alive = false }
  }, [vaultPath])

  useEffect(() => {
    let alive = true
    window.chuckle.vault.getRemote(vaultPath).then((r) => {
      if (alive) setVaultRemote(r)
    })
    window.chuckle.project.readClaudeMd(vaultPath).then((c) => {
      if (alive) setHasClaudeMd(c !== null)
    })
    return () => { alive = false }
  }, [vaultPath])

  function copyRemote(): void {
    if (!vaultRemote) return
    navigator.clipboard.writeText(vaultRemote).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  async function act(action: ReviewAction): Promise<void> {
    setBusy(true)
    try {
      const r = await window.chuckle.review.action(vaultPath, feature, type, action)
      onActionComplete(r)
    } finally {
      setBusy(false)
    }
  }

  // Determine reviewer list: prefer required_approvers, else keys from record.reviewers
  const reviewerList: string[] =
    workflow?.required_approvers?.length
      ? workflow.required_approvers
      : record?.reviewers
        ? Object.keys(record.reviewers)
        : []

  // Current user's reviewer status
  const meStatus: ReviewerStatus = record?.reviewers?.[authorEmail]?.status ?? 'pending'

  // Whether the current user is a member (can act)
  const isMember =
    !workflow?.required_approvers?.length ||
    workflow.required_approvers.includes(authorEmail)

  if (showSettings) {
    return (
      <aside className="w-80 min-w-80 border-l border-border bg-surface flex flex-col h-full overflow-y-auto">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-[11px] font-semibold text-fg/45">Reviewer settings</h2>
          <button
            onClick={() => setShowSettings(false)}
            className="text-[12px] text-fg/50 hover:text-fg transition"
          >
            Back
          </button>
        </div>
        <div className="p-5">
          <ReviewerSettings vaultPath={vaultPath} onClose={() => setShowSettings(false)} />
        </div>
      </aside>
    )
  }

  return (
    <aside className="w-80 min-w-80 border-l border-border bg-surface flex flex-col h-full overflow-y-auto">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[11px] font-semibold text-fg/45">Review</h2>
          <button
            onClick={() => setShowSettings(true)}
            className="text-[11px] text-fg/40 hover:text-iris transition px-1.5 py-0.5 rounded hover:bg-iris/10"
          >
            Reviewers
          </button>
        </div>
        {record === undefined ? (
          <p className="text-[12px] text-fg/40">Loading…</p>
        ) : (
          <div className="space-y-2.5">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium ${statusPill(derivedStatus)}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusDot(derivedStatus)}`} />
              {statusLabel(derivedStatus)}
            </span>
            {submittedBy && (
              <p className="text-[12px] text-fg/50">
                Submitted by <span className="text-fg/75">{submittedBy}</span>
              </p>
            )}
            {workflow && derivedStatus !== 'approved' && (
              <p className="text-[11.5px] leading-relaxed text-fg/45">
                Needs {workflow.min_approvals} approval
                {workflow.min_approvals === 1 ? '' : 's'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Reviewers list */}
      {record !== undefined && reviewerList.length > 0 && (
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-[11px] font-semibold text-fg/45 mb-2.5">Reviewers</h3>
          <ul className="space-y-2">
            {reviewerList.map((email) => {
              const rs: ReviewerStatus = record?.reviewers?.[email]?.status ?? 'pending'
              return (
                <li key={email} className="flex items-center justify-between gap-2">
                  <span className="text-[12px] text-fg/75 truncate">{email}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${reviewerStatusPill(rs)}`}>
                    {reviewerStatusLabel(rs)}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Current user's actions */}
      {record !== undefined && record !== null && isMember && (
        <div className="px-5 py-4 border-b border-border space-y-2">
          {meStatus === 'pending' && (
            <button
              onClick={() => act('start_review')}
              disabled={busy}
              className="w-full px-4 py-2 rounded-lg bg-iris text-white text-[13px] font-semibold hover:brightness-95 active:brightness-90 disabled:opacity-50 transition"
            >
              Start review
            </button>
          )}
          {meStatus === 'in_review' && (
            <>
              <button
                onClick={() => act('approve')}
                disabled={busy}
                className="w-full px-4 py-2 rounded-lg bg-ok text-white text-[13px] font-semibold hover:brightness-95 active:brightness-90 disabled:opacity-50 transition"
              >
                Approve
              </button>
              <button
                onClick={() => act('request_changes')}
                disabled={busy}
                className="w-full px-4 py-2 rounded-lg border border-border text-fg/80 text-[13px] font-medium hover:bg-app disabled:opacity-50 transition"
              >
                Request changes
              </button>
            </>
          )}
          {(meStatus === 'approved' || meStatus === 'changes_requested') && (
            <>
              <p className="text-[12px] text-fg/50">
                Your decision:{' '}
                <span className={meStatus === 'approved' ? 'text-ok' : 'text-stop'}>
                  {meStatus === 'approved' ? 'Approved' : 'Changes requested'}
                </span>
              </p>
              <button
                onClick={() => act('reopen')}
                disabled={busy}
                className="w-full px-4 py-2 rounded-lg border border-border text-fg/80 text-[13px] font-medium hover:bg-app disabled:opacity-50 transition"
              >
                Reopen
              </button>
            </>
          )}
        </div>
      )}

      {record && record.history.length > 0 && <ReviewHistory history={record.history} />}

      {/* Vault access */}
      <div className="px-5 py-4 border-t border-border mt-auto">
        <h3 className="text-[11px] font-semibold text-fg/45 mb-2">Vault access</h3>
        {vaultRemote ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <code className="text-[11px] text-fg/80 font-mono bg-app px-1.5 py-0.5 rounded truncate flex-1 min-w-0 block">
                {vaultRemote}
              </code>
              <button
                onClick={copyRemote}
                title="Copy clone URL"
                className="shrink-0 text-[11px] text-fg/40 hover:text-iris transition px-1.5 py-0.5 rounded hover:bg-iris/10"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-[11px] text-fg/45 leading-relaxed">
              Reviewers clone this repo and are recognized by their git email.
            </p>
          </div>
        ) : vaultRemote === null ? (
          <p className="text-[11px] text-fg/40 leading-relaxed">
            Configure a remote in source control so reviewers can access the vault.
          </p>
        ) : null}
        {hasClaudeMd && (
          <p className="mt-2 text-[11px] text-ok font-medium">
            Project CLAUDE.md detected
          </p>
        )}
      </div>
    </aside>
  )
}
