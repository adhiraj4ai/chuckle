import React, { useEffect, useRef, useState } from 'react'
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
  return 'bg-app text-muted'
}

function statusDot(status: Status): string {
  if (status === 'pending') return 'bg-wait'
  if (status === 'in_review') return 'bg-wait'
  if (status === 'approved') return 'bg-ok'
  if (status === 'rejected') return 'bg-stop'
  return 'bg-ink/30'
}

function reviewerStatusLabel(status: ReviewerStatus): string {
  if (status === 'pending') return 'Awaiting review'
  if (status === 'in_review') return 'In review'
  if (status === 'approved') return 'Approved'
  if (status === 'changes_requested') return 'Changes requested'
  return 'Awaiting review'
}

function formatReviewerDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function reviewerStatusPill(status: ReviewerStatus): string {
  if (status === 'approved') return 'bg-ok-soft text-ok'
  if (status === 'changes_requested') return 'bg-stop-soft text-stop'
  if (status === 'in_review') return 'bg-wait-soft text-wait'
  return 'bg-app text-muted'
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
  missingDiagram?: boolean
  onActionComplete: (result?: ReviewResult) => void
}

export function ReviewPanel({
  vaultPath,
  feature,
  type,
  record,
  derivedStatus,
  workflow,
  missingDiagram,
  onActionComplete,
}: Props): React.ReactElement {
  const submittedBy = record?.history.find((e) => e.action === 'submitted')?.by

  const [authorEmail, setAuthorEmail] = useState<string>('')
  const [showSettings, setShowSettings] = useState(false)
  const [busy, setBusy] = useState(false)
  // Ref guard: `busy` state updates asynchronously, so a fast double-click can
  // fire two actions before the disabled state lands. The ref blocks the second.
  const busyRef = useRef(false)
  const [vaultRemote, setVaultRemote] = useState<string | null | undefined>(undefined)
  const [hasClaudeMd, setHasClaudeMd] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pendingAction, setPendingAction] = useState<'approve' | 'request_changes' | null>(null)
  const [note, setNote] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    window.signoff.vault.author(vaultPath)
      .then((a) => { if (alive) setAuthorEmail(a.email) })
      .catch(() => { /* author stays '' — actions guarded by membership */ })
    return () => { alive = false }
  }, [vaultPath])

  useEffect(() => {
    let alive = true
    window.signoff.vault.getRemote(vaultPath)
      .then((r) => { if (alive) setVaultRemote(r) })
      .catch(() => { if (alive) setVaultRemote(null) })
    window.signoff.project.readClaudeMd(vaultPath)
      .then((c) => { if (alive) setHasClaudeMd(c !== null) })
      .catch(() => { if (alive) setHasClaudeMd(false) })
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
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setActionError(null)
    try {
      const r = await window.signoff.review.action(vaultPath, feature, type, action)
      onActionComplete(r)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function submitWithNote(): Promise<void> {
    if (!pendingAction) return
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setActionError(null)
    try {
      const r = await window.signoff.review.action(vaultPath, feature, type, pendingAction, note.trim() || null)
      setPendingAction(null); setNote('')
      onActionComplete(r)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      busyRef.current = false
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

  // Reset composer when reviewer leaves in_review
  useEffect(() => {
    if (meStatus !== 'in_review') { setPendingAction(null); setNote(''); setActionError(null) }
  }, [meStatus])

  // Whether the current user is a member (can act)
  const isMember =
    !workflow?.required_approvers?.length ||
    workflow.required_approvers.includes(authorEmail)

  if (showSettings) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-[11px] font-semibold text-muted">Reviewer settings</h2>
          <button
            onClick={() => setShowSettings(false)}
            className="text-[12px] text-muted hover:text-fg transition"
          >
            Back
          </button>
        </div>
        <div className="p-5">
          <ReviewerSettings vaultPath={vaultPath} onClose={() => setShowSettings(false)} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[11px] font-semibold text-muted">Review</h2>
          <button
            onClick={() => setShowSettings(true)}
            className="text-[11px] text-faint hover:text-iris transition px-1.5 py-0.5 rounded hover:bg-iris-soft"
          >
            Reviewers
          </button>
        </div>
        {record === undefined ? (
          <p className="text-[12px] text-faint">Loading…</p>
        ) : (
          <div className="space-y-2.5">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium ${statusPill(derivedStatus)}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusDot(derivedStatus)}`} />
              {statusLabel(derivedStatus)}
            </span>
            {submittedBy && (
              <p className="text-[12px] text-muted">
                Submitted by <span className="text-fg/75">{submittedBy}</span>
              </p>
            )}
            {workflow && derivedStatus !== 'approved' && (
              <p className="text-[11.5px] leading-relaxed text-muted">
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
          <h3 className="text-[11px] font-semibold text-muted mb-1.5">Reviewers</h3>
          {(() => {
            const approvedCount = reviewerList.filter(
              (e) => record?.reviewers?.[e]?.status === 'approved'
            ).length
            const changesCount = reviewerList.filter(
              (e) => record?.reviewers?.[e]?.status === 'changes_requested'
            ).length
            const total = reviewerList.length
            return (
              <p className="text-[11px] text-muted mb-2.5">
                {approvedCount} of {total} approved
                {changesCount > 0 ? ` · ${changesCount} requested changes` : ''}
              </p>
            )
          })()}
          <ul className="space-y-2">
            {[...reviewerList]
              .sort((a, b) => {
                const aActed = record?.reviewers?.[a] !== undefined && record?.reviewers?.[a]?.status !== 'pending'
                const bActed = record?.reviewers?.[b] !== undefined && record?.reviewers?.[b]?.status !== 'pending'
                if (aActed && !bActed) return -1
                if (!aActed && bActed) return 1
                return 0
              })
              .map((email) => {
                const entry = record?.reviewers?.[email]
                const rs: ReviewerStatus = entry?.status ?? 'pending'
                const hasActed = entry !== undefined && rs !== 'pending'
                return (
                  <li key={email} className="flex items-center justify-between gap-2">
                    <span className="text-[12px] text-fg/75 truncate">{email}</span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {hasActed && entry?.at && (
                        <span className="text-[11px] text-faint">{formatReviewerDate(entry.at)}</span>
                      )}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${reviewerStatusPill(rs)}`}>
                        {reviewerStatusLabel(rs)}
                      </span>
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
          {actionError && <p className="text-stop text-[12px]">{actionError}</p>}
          {missingDiagram && (
            <p className="text-[12px] text-wait bg-wait-soft border border-wait/20 rounded-lg px-3 py-2">
              ⚠ Diagram required — add a mermaid block or an image before this can be approved.
            </p>
          )}
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
              {pendingAction === null ? (
                <>
                  <button
                    onClick={() => { setPendingAction('approve'); setNote(''); setActionError(null) }}
                    disabled={busy || missingDiagram}
                    className="w-full px-4 py-2 rounded-lg bg-ok text-white text-[13px] font-semibold hover:brightness-95 active:brightness-90 disabled:opacity-50 transition"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => { setPendingAction('request_changes'); setNote(''); setActionError(null) }}
                    disabled={busy}
                    className="w-full px-4 py-2 rounded-lg border border-border text-fg/80 text-[13px] font-medium hover:bg-app disabled:opacity-50 transition"
                  >
                    Request changes
                  </button>
                </>
              ) : (
                <div className="space-y-2">
                  <p className="text-[12px] text-muted">
                    {pendingAction === 'approve' ? 'Approve with note' : 'Request changes'}
                  </p>
                  <textarea
                    className="w-full rounded-lg bg-surface border border-border focus:outline-none focus:ring-2 focus:ring-iris/30 text-[13px] text-fg/90 placeholder:text-faint px-3 py-2 resize-none"
                    rows={3}
                    placeholder="Add a note (optional)…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <button
                    onClick={submitWithNote}
                    disabled={busy || (pendingAction === 'approve' && missingDiagram)}
                    className={pendingAction === 'approve'
                      ? 'w-full px-4 py-2 rounded-lg bg-ok text-white text-[13px] font-semibold hover:brightness-95 active:brightness-90 disabled:opacity-50 transition'
                      : 'w-full px-4 py-2 rounded-lg border border-border text-fg/80 text-[13px] font-medium hover:bg-app disabled:opacity-50 transition'}
                  >
                    {pendingAction === 'approve' ? 'Approve' : 'Request changes'}
                  </button>
                  <button
                    onClick={() => { setPendingAction(null); setNote('') }}
                    className="w-full px-4 py-2 rounded-lg border border-border text-muted text-[13px] font-medium hover:bg-app transition"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
          {(meStatus === 'approved' || meStatus === 'changes_requested') && (
            <>
              <p className="text-[12px] text-muted">
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
        <h3 className="text-[11px] font-semibold text-muted mb-2">Vault access</h3>
        {vaultRemote ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <code className="text-[11px] text-fg/80 font-mono bg-app px-1.5 py-0.5 rounded truncate flex-1 min-w-0 block">
                {vaultRemote}
              </code>
              <button
                onClick={copyRemote}
                title="Copy clone URL"
                className="shrink-0 text-[11px] text-faint hover:text-iris transition px-1.5 py-0.5 rounded hover:bg-iris-soft"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-[11px] text-muted leading-relaxed">
              Reviewers clone this repo and are recognized by their git email.
            </p>
          </div>
        ) : vaultRemote === null ? (
          <p className="text-[11px] text-muted leading-relaxed">
            Configure a remote in source control so reviewers can access the vault.
          </p>
        ) : null}
        {hasClaudeMd && (
          <p className="mt-2 text-[11px] text-ok font-medium">
            Project CLAUDE.md detected
          </p>
        )}
      </div>
    </div>
  )
}
