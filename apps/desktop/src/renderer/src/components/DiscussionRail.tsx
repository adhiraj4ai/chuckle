import React, { useEffect, useRef, useState } from 'react'
import type { DocumentType, CommentsFile, CommentThread, CommentEntry } from '@shared/ipc-types'
import { extractHeadings, type Heading } from '../lib/headings.js'

interface Props {
  vaultPath: string
  feature: string
  type: DocumentType
  markdown: string
  /** A comment request from the document: anchor + focus the composer, and
   *  attach the selected text (if any) as the thread's quote. */
  openRequest?: { slug: string; text: string; quote?: string; nonce: number } | null
  /** Called after any comment mutation so the document's highlights refresh. */
  onCommentsChanged?: () => void
}

// --- Identity color helper (deterministic from author string) -------------
const IDENTITY_HEX = ['#5b57d6', '#1f9d6b', '#c77b16', '#3b82c4', '#8a8f99', '#d1495b'] as const

function identityColor(who: string): string {
  let hash = 0
  for (let i = 0; i < who.length; i++) {
    hash = (hash * 31 + who.charCodeAt(i)) | 0
  }
  return IDENTITY_HEX[Math.abs(hash) % IDENTITY_HEX.length]
}

function initials(who: string): string {
  const name = (who.split('@')[0] ?? who).replace(/[._-]+/g, ' ').trim()
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function relativeTime(at: string): string {
  const then = new Date(at).getTime()
  if (Number.isNaN(then)) return at
  const diff = Date.now() - then
  const sec = Math.round(diff / 1000)
  if (sec < 45) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(at).toLocaleDateString()
}

// --- A single comment (or reply) as a timeline node -----------------------
function CommentNode({ comment, isReply }: { comment: CommentEntry; isReply: boolean }): React.ReactElement {
  const color = identityColor(comment.by)
  return (
    <div className={`relative flex gap-2.5 ${isReply ? 'pl-6' : ''}`}>
      {isReply && (
        // short connector tick from the parent thread's spine to this reply
        <span aria-hidden className="absolute left-2 top-3 w-3.5 h-px bg-border" />
      )}
      <div
        className="mt-0.5 w-7 h-7 shrink-0 rounded-lg grid place-items-center text-white text-[11px] font-mono font-bold shadow-sm"
        style={{ backgroundColor: color }}
        aria-hidden
      >
        {initials(comment.by)}
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <div className="flex items-baseline gap-1.5">
          <span className="font-medium text-fg/85 truncate text-[12px]">{comment.by}</span>
          <span className="text-faint shrink-0 text-[11px]">{relativeTime(comment.at)}</span>
        </div>
        <p className="text-fg/75 leading-relaxed whitespace-pre-wrap text-[12.5px] mt-0.5">{comment.body}</p>
      </div>
    </div>
  )
}

// --- One thread rendered as a connected timeline --------------------------
function ThreadItem({
  thread,
  vaultPath,
  feature,
  type,
  onRefresh,
}: {
  thread: CommentThread
  vaultPath: string
  feature: string
  type: DocumentType
  onRefresh: (file: CommentsFile) => void
}): React.ReactElement {
  const [replyBody, setReplyBody] = useState('')
  const [replyOpen, setReplyOpen] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleResolve(): Promise<void> {
    setError(null)
    try {
      const result = await window.signoff.comments.setResolved(vaultPath, feature, type, thread.id, !thread.resolved)
      onRefresh(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleReply(): Promise<void> {
    if (!replyBody.trim()) return
    setPosting(true)
    setError(null)
    try {
      const result = await window.signoff.comments.addReply(vaultPath, feature, type, thread.id, replyBody.trim())
      onRefresh(result)
      setReplyBody('')
      setReplyOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="relative pl-3">
      {/* vertical connector spine down the left of the thread */}
      <span aria-hidden className="absolute left-0 top-1 bottom-1 w-px bg-border" />
      {thread.quote && (
        <p className="mb-2 border-l-2 border-iris rounded-r bg-iris-soft px-2 py-1 text-[11.5px] italic text-muted line-clamp-2">
          “{thread.quote}”
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        {thread.comments.map((c, i) => (
          <CommentNode key={c.id} comment={c} isReply={i > 0} />
        ))}
      </div>

      <div className="mt-1.5 flex items-center gap-3 pl-9">
        <button
          onClick={() => setReplyOpen((v) => !v)}
          className="text-muted hover:text-iris-ink transition text-[11px] rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-iris/40"
        >
          Reply
        </button>
        <button
          onClick={handleResolve}
          className={`text-[11px] transition rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-iris/40 ${
            thread.resolved ? 'text-ok hover:text-muted' : 'text-muted hover:text-ok'
          }`}
        >
          {thread.resolved ? 'Resolved' : 'Resolve'}
        </button>
      </div>

      {error && (
        <p className="mt-1.5 pl-9 text-[11px] text-stop" role="alert">
          {error}
        </p>
      )}

      {replyOpen && (
        <div className="mt-2 pl-9 flex flex-col gap-1.5">
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Write a reply…"
            rows={2}
            className="w-full rounded-md border border-border bg-surface text-fg text-[12px] px-2.5 py-1.5 resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-iris/40"
          />
          <div className="flex gap-1.5">
            <button
              onClick={handleReply}
              disabled={posting || !replyBody.trim()}
              className="px-2.5 py-1 rounded-md bg-iris text-white text-[11px] font-medium disabled:opacity-50 hover:brightness-95 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-iris/40"
            >
              {posting ? 'Posting…' : 'Post reply'}
            </button>
            <button
              onClick={() => {
                setReplyOpen(false)
                setReplyBody('')
              }}
              className="px-2.5 py-1 rounded-md border border-border text-fg/60 text-[11px] hover:bg-surface transition focus:outline-none focus-visible:ring-2 focus-visible:ring-iris/40"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// --- A heading group: anchored label + its threads ------------------------
function ThreadGroup({
  heading,
  threads,
  isActiveAnchor,
  onAnchor,
  vaultPath,
  feature,
  type,
  onRefresh,
}: {
  heading: Heading | null
  threads: CommentThread[]
  isActiveAnchor: boolean
  onAnchor: () => void
  vaultPath: string
  feature: string
  type: DocumentType
  onRefresh: (file: CommentsFile) => void
}): React.ReactElement {
  const sectionLabel = heading ? heading.text : 'General'
  const count = threads.reduce((n, t) => n + t.comments.length, 0)
  const allResolved = threads.length > 0 && threads.every((t) => t.resolved)
  const [expanded, setExpanded] = useState(false)

  return (
    <section className="mb-5" data-section={heading?.slug ?? 'general'}>
      {/* Anchored heading label: iris rail + mono micro-label + right-aligned count */}
      <button
        type="button"
        onClick={onAnchor}
        aria-label={`Comment on ${sectionLabel}`}
        aria-pressed={isActiveAnchor}
        className="group w-full flex items-center gap-2 mb-2 text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-iris/40"
      >
        <span
          aria-hidden
          className={`w-0.5 self-stretch min-h-[1.1rem] rounded-full transition-colors ${
            isActiveAnchor ? 'bg-iris' : 'bg-iris/30 group-hover:bg-iris/60'
          }`}
        />
        <h3 className="font-mono text-[11px] font-semibold tracking-wide text-muted group-hover:text-fg/70 transition-colors truncate">
          {sectionLabel}
        </h3>
        {count > 0 && (
          <span className="ml-auto shrink-0 font-mono text-[10.5px] text-faint tabular-nums">
            {count}
          </span>
        )}
      </button>

      {/* Resolved thread groups collapse to a one-line green summary */}
      {allResolved && !expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full flex items-center gap-2 rounded-md bg-ok-soft text-ok px-2.5 py-1.5 text-[12px] transition hover:brightness-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-iris/40"
        >
          <svg viewBox="0 0 16 16" aria-hidden className="w-3.5 h-3.5 shrink-0 fill-current">
            <path d="M6.2 11.3 2.9 8l1-1 2.3 2.3L11.1 4.6l1 1z" />
          </svg>
          <span className="truncate">
            <span className="font-medium">{sectionLabel}</span> — resolved
          </span>
          <span className="ml-auto shrink-0 text-ok/80">
            {count} {count === 1 ? 'comment' : 'comments'} · show
          </span>
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          {allResolved && expanded && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="self-start text-[11px] text-ok hover:text-muted transition rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-iris/40"
            >
              Hide resolved
            </button>
          )}
          {threads.map((t) => (
            <ThreadItem
              key={t.id}
              thread={t}
              vaultPath={vaultPath}
              feature={feature}
              type={type}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export function DiscussionRail({ vaultPath, feature, type, markdown, openRequest, onCommentsChanged }: Props): React.ReactElement {
  const [commentsFile, setCommentsFile] = useState<CommentsFile | null>(null)
  const [anchorSlug, setAnchorSlug] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [pendingQuote, setPendingQuote] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCommentsFile(null)
    setAnchorSlug(null)
    setBody('')
    setPendingQuote(null)
    setError(null)
    window.signoff.comments
      .read(vaultPath, feature, type)
      .then(setCommentsFile)
      .catch(() => setCommentsFile({ version: 1, threads: [] }))
  }, [vaultPath, feature, type])

  const headings = extractHeadings(markdown)
  const headingSlugs = new Set(headings.map((h) => h.slug))
  const threads = commentsFile?.threads ?? []

  // Respond to a comment request from the document: anchor to that section,
  // prefill the quoted selection, then focus the composer and scroll to it.
  useEffect(() => {
    if (!openRequest) return
    setAnchorSlug(headingSlugs.has(openRequest.slug) ? openRequest.slug : headings[0]?.slug ?? null)
    setPendingQuote(openRequest.quote ?? null)
    requestAnimationFrame(() => {
      const el = scrollRef.current?.querySelector(`[data-section="${openRequest.slug}"]`)
      if (el instanceof HTMLElement && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest' })
      }
      const ta = textareaRef.current
      if (ta) {
        ta.focus()
        const len = ta.value.length
        ta.setSelectionRange(len, len)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.nonce])

  // Group threads by section slug
  const bySection = new Map<string, CommentThread[]>()
  const generalThreads: CommentThread[] = []
  for (const t of threads) {
    if (headingSlugs.has(t.section)) {
      const arr = bySection.get(t.section) ?? []
      arr.push(t)
      bySection.set(t.section, arr)
    } else {
      generalThreads.push(t)
    }
  }

  function handleRefresh(file: CommentsFile): void {
    setCommentsFile(file)
    onCommentsChanged?.()
  }

  // Default the composer's anchor to the first heading once headings are known.
  const effectiveAnchor = anchorSlug ?? headings[0]?.slug ?? null
  const anchorHeading = headings.find((h) => h.slug === effectiveAnchor) ?? null
  const anchorLabel = anchorHeading ? anchorHeading.text : 'the document'

  async function handlePost(): Promise<void> {
    if (!body.trim() || !anchorHeading) return
    setPosting(true)
    setError(null)
    try {
      const result = await window.signoff.comments.addThread(
        vaultPath,
        feature,
        type,
        anchorHeading.slug,
        anchorHeading.line,
        body.trim(),
        pendingQuote ?? undefined,
      )
      handleRefresh(result)
      setBody('')
      setPendingQuote(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPosting(false)
    }
  }

  if (commentsFile === null) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        <div className="flex-1 grid place-items-center text-[12px] text-faint">Loading discussion…</div>
      </div>
    )
  }

  const hasAnyThreads = threads.length > 0
  const hasHeadings = headings.length > 0

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Scrollable thread area */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {!hasHeadings ? (
          <p className="text-[12px] text-muted leading-relaxed">
            This document has no headings yet, so there is nowhere to anchor a comment. Add a heading to
            start the conversation.
          </p>
        ) : !hasAnyThreads ? (
          <p className="text-[12.5px] text-muted leading-relaxed">
            No comments yet. Hover a heading in the document — or select some text — to add the first one.
          </p>
        ) : null}

        {/* Show only sections that actually have comments (commenting starts from
            the document itself), newest-anchored sections in document order. */}
        {headings
          .filter((h) => (bySection.get(h.slug)?.length ?? 0) > 0)
          .map((h) => (
            <ThreadGroup
              key={h.slug}
              heading={h}
              threads={bySection.get(h.slug) ?? []}
              isActiveAnchor={effectiveAnchor === h.slug}
              onAnchor={() => setAnchorSlug(h.slug)}
              vaultPath={vaultPath}
              feature={feature}
              type={type}
              onRefresh={handleRefresh}
            />
          ))}

        {generalThreads.length > 0 && (
          <ThreadGroup
            heading={null}
            threads={generalThreads}
            isActiveAnchor={false}
            onAnchor={() => {}}
            vaultPath={vaultPath}
            feature={feature}
            type={type}
            onRefresh={handleRefresh}
          />
        )}
      </div>

      {/* Composer pinned at the bottom */}
      {hasHeadings && (
        <div className="shrink-0 border-t border-border bg-rail px-4 py-3">
          {pendingQuote && (
            <div className="mb-2 flex items-start gap-2 rounded-lg border-l-2 border-iris bg-iris-soft px-2.5 py-1.5">
              <p className="min-w-0 flex-1 text-[11.5px] italic text-muted line-clamp-2">“{pendingQuote}”</p>
              <button
                onClick={() => setPendingQuote(null)}
                aria-label="Remove quoted text"
                className="shrink-0 text-faint hover:text-stop leading-none text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-iris/40 rounded"
              >
                ×
              </button>
            </div>
          )}
          <div className="rounded-xl border border-border bg-surface focus-within:ring-2 focus-within:ring-iris/40 transition-shadow shadow-sm overflow-hidden">
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={`Add a comment on ${anchorLabel}`}
              rows={2}
              className="w-full bg-transparent text-fg text-[12.5px] px-3 py-2.5 resize-none focus:outline-none placeholder:text-faint"
            />
            <div className="flex items-center gap-2 px-2.5 py-2 border-t border-border bg-app">
              <span className="min-w-0 flex items-center gap-1.5 text-[11px] text-muted">
                <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-iris shrink-0" />
                <span className="truncate">
                  Anchored to <span className="font-medium text-fg/60">{anchorLabel}</span>
                </span>
              </span>
              <button
                onClick={handlePost}
                disabled={posting || !body.trim()}
                className="ml-auto shrink-0 px-3 py-1 rounded-md bg-iris text-white text-[11.5px] font-medium disabled:opacity-50 hover:brightness-95 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-iris/40"
              >
                {posting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
          {error && (
            <p className="mt-1.5 text-[11px] text-stop" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
