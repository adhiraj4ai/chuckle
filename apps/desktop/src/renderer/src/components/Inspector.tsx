import React, { useEffect, useState } from 'react'
import type {
  ApprovalRecord,
  ApprovalStatus,
  Category,
  DocumentType,
  FeatureEntry,
  ReviewResult,
  WorkflowConfig,
} from '@shared/ipc-types'
import { SignOffSeal } from './SignOffSeal'
import { DetailsPanel } from './DetailsPanel'
import { ReviewPanel } from './ReviewPanel'
import { DiscussionRail } from './DiscussionRail.js'
import { AuditPanel } from './AuditPanel.js'

interface Props {
  vaultPath: string
  feature: FeatureEntry
  type: DocumentType
  docTypes: { type: DocumentType; status: ApprovalStatus | 'not_found' }[]
  categories: Category[]
  record: ApprovalRecord | null | undefined
  workflow: WorkflowConfig | undefined
  missingDiagram: boolean
  markdown: string
  /** Bumped on sync/action so the comment count re-reads. */
  reloadKey: number
  /** A comment request from the document; switches to Discussion and anchors it. */
  commentRequest?: { slug: string; text: string; quote?: string; nonce: number } | null
  /** Bumped when comments change so the tab badge re-reads. */
  commentsVersion?: number
  onActionComplete: (result?: ReviewResult) => void
  onChanged: () => void
  onManageCategories?: () => void
  /** Forwarded to the discussion so document highlights refresh after a change. */
  onCommentsChanged?: () => void
}

/**
 * The right rail: sign-off seal, feature details, and a Review｜Discussion
 * segmented control below. Owns the rail frame; ReviewPanel and DiscussionRail
 * render as its inner content.
 */
export function Inspector({
  vaultPath,
  feature,
  type,
  docTypes,
  categories,
  record,
  workflow,
  missingDiagram,
  markdown,
  reloadKey,
  commentRequest,
  commentsVersion,
  onActionComplete,
  onChanged,
  onManageCategories,
  onCommentsChanged,
}: Props): React.ReactElement {
  const [tab, setTab] = useState<'review' | 'discussion' | 'audit'>('review')
  const [openComments, setOpenComments] = useState(0)

  // A comment request from the document opens the Discussion tab.
  useEffect(() => {
    if (commentRequest) setTab('discussion')
  }, [commentRequest?.nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  const derivedStatus = docTypes.find((d) => d.type === type)?.status ?? 'not_found'
  const approvedCount = record?.reviewers
    ? Object.values(record.reviewers).filter((r) => r.status === 'approved').length
    : 0

  useEffect(() => {
    let alive = true
    Promise.resolve(window.signoff.comments.read(vaultPath, feature.name, type))
      .then((c) => {
        if (alive) setOpenComments(c?.threads?.filter((t) => !t.resolved).length ?? 0)
      })
      .catch(() => {
        if (alive) setOpenComments(0)
      })
    return () => {
      alive = false
    }
  }, [vaultPath, feature.name, type, reloadKey, commentsVersion])

  const tabBtn = (active: boolean): string =>
    `flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-semibold transition ${
      active ? 'bg-surface text-iris-ink shadow-sm' : 'text-muted hover:text-fg/80'
    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/40`

  return (
    <aside className="w-[336px] min-w-[336px] border-l border-border bg-rail flex flex-col h-full overflow-hidden">
      <SignOffSeal
        status={derivedStatus}
        type={type}
        approvedCount={approvedCount}
        totalRequired={workflow?.min_approvals}
      />

      <DetailsPanel
        vaultPath={vaultPath}
        feature={feature}
        categories={categories}
        onChanged={onChanged}
        onManageCategories={onManageCategories}
      />

      <div className="px-4 pt-3 pb-2 border-b border-border">
        <div className="flex gap-1 bg-app p-1 rounded-lg border border-border">
          <button className={tabBtn(tab === 'review')} onClick={() => setTab('review')} aria-pressed={tab === 'review'}>
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            Review
          </button>
          <button className={tabBtn(tab === 'discussion')} onClick={() => setTab('discussion')} aria-pressed={tab === 'discussion'}>
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a8.38 8.38 0 0 1-.9-4A8.5 8.5 0 0 1 21 11.5z" />
            </svg>
            Discussion
            {openComments > 0 && (
              <span className="ml-0.5 min-w-[16px] rounded-full bg-iris px-1 text-center text-[9.5px] font-bold leading-4 text-white tabular-nums">
                {openComments}
              </span>
            )}
          </button>
          <button className={tabBtn(tab === 'audit')} onClick={() => setTab('audit')} aria-pressed={tab === 'audit'}>
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v4l3 3M12 3a9 9 0 1 0 9 9" />
            </svg>
            Audit
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {tab === 'discussion' ? (
          <DiscussionRail
            vaultPath={vaultPath}
            feature={feature.name}
            type={type}
            markdown={markdown}
            openRequest={commentRequest ?? null}
            onCommentsChanged={onCommentsChanged}
          />
        ) : tab === 'audit' ? (
          <AuditPanel vaultPath={vaultPath} feature={feature.name} />
        ) : (
          <ReviewPanel
            vaultPath={vaultPath}
            feature={feature.name}
            type={type}
            record={record}
            derivedStatus={derivedStatus}
            workflow={workflow}
            missingDiagram={missingDiagram}
            onActionComplete={onActionComplete}
          />
        )}
      </div>
    </aside>
  )
}
