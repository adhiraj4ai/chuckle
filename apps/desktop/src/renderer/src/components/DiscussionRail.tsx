import React, { useEffect, useState } from 'react'
import type { DocumentType, CommentsFile, CommentThread } from '@shared/ipc-types'
import { extractHeadings, type Heading } from '../lib/headings.js'

interface Props {
  vaultPath: string
  feature: string
  type: DocumentType
  markdown: string
}

interface ThreadGroupProps {
  heading: Heading | null
  threads: CommentThread[]
  vaultPath: string
  feature: string
  type: DocumentType
  onRefresh: (file: CommentsFile) => void
}

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

  async function handleResolve(): Promise<void> {
    const result = await window.chuckle.comments.setResolved(vaultPath, feature, type, thread.id, !thread.resolved)
    onRefresh(result)
  }

  async function handleReply(): Promise<void> {
    if (!replyBody.trim()) return
    setPosting(true)
    try {
      const result = await window.chuckle.comments.addReply(vaultPath, feature, type, thread.id, replyBody.trim())
      onRefresh(result)
      setReplyBody('')
      setReplyOpen(false)
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className={`rounded-lg border border-border bg-app p-3 text-[12px] ${thread.resolved ? 'opacity-60' : ''}`}>
      {thread.comments.map((c) => (
        <div key={c.id} className="mb-2 last:mb-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="font-medium text-fg/80 truncate">{c.by}</span>
            <span className="text-fg/35 shrink-0">{new Date(c.at).toLocaleDateString()}</span>
          </div>
          <p className="text-fg/75 leading-relaxed whitespace-pre-wrap">{c.body}</p>
        </div>
      ))}
      <div className="mt-2 flex items-center gap-2 pt-2 border-t border-border">
        <button
          onClick={() => setReplyOpen((v) => !v)}
          className="text-fg/50 hover:text-fg transition text-[11px]"
        >
          Reply
        </button>
        <button
          onClick={handleResolve}
          className={`text-[11px] transition ${thread.resolved ? 'text-ok hover:text-fg/50' : 'text-fg/50 hover:text-ok'}`}
        >
          {thread.resolved ? 'Resolved' : 'Resolve'}
        </button>
      </div>
      {replyOpen && (
        <div className="mt-2 flex flex-col gap-1.5">
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Write a reply…"
            rows={2}
            className="w-full rounded-md border border-border bg-surface text-fg text-[12px] px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-iris/50"
          />
          <div className="flex gap-1.5">
            <button
              onClick={handleReply}
              disabled={posting || !replyBody.trim()}
              className="px-2.5 py-1 rounded-md bg-iris text-white text-[11px] font-medium disabled:opacity-50 hover:brightness-95 transition"
            >
              {posting ? 'Posting…' : 'Post reply'}
            </button>
            <button
              onClick={() => { setReplyOpen(false); setReplyBody('') }}
              className="px-2.5 py-1 rounded-md border border-border text-fg/60 text-[11px] hover:bg-surface transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ThreadGroup({
  heading,
  threads,
  vaultPath,
  feature,
  type,
  onRefresh,
}: ThreadGroupProps): React.ReactElement {
  const [composerOpen, setComposerOpen] = useState(false)
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)

  const sectionLabel = heading ? heading.text : 'General'
  const slug = heading ? heading.slug : ''
  const line = heading ? heading.line : 0

  async function handlePost(): Promise<void> {
    if (!body.trim()) return
    setPosting(true)
    try {
      const result = await window.chuckle.comments.addThread(vaultPath, feature, type, slug, line, body.trim())
      onRefresh(result)
      setBody('')
      setComposerOpen(false)
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[12px] font-semibold text-fg/70">{sectionLabel}</h3>
        {heading && (
          <button
            onClick={() => setComposerOpen((v) => !v)}
            aria-label={`Comment on ${sectionLabel}`}
            className="text-[11px] text-iris hover:text-iris-ink transition px-2 py-0.5 rounded hover:bg-iris/10"
          >
            Comment
          </button>
        )}
      </div>

      {composerOpen && (
        <div className="mb-2 flex flex-col gap-1.5 bg-surface rounded-lg border border-border p-2.5">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Add a comment on ${sectionLabel}`}
            rows={3}
            className="w-full rounded-md border border-border bg-app text-fg text-[12px] px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-iris/50"
          />
          <div className="flex gap-1.5">
            <button
              onClick={handlePost}
              disabled={posting || !body.trim()}
              className="px-2.5 py-1 rounded-md bg-iris text-white text-[11px] font-medium disabled:opacity-50 hover:brightness-95 transition"
            >
              {posting ? 'Posting…' : 'Post'}
            </button>
            <button
              onClick={() => { setComposerOpen(false); setBody('') }}
              className="px-2.5 py-1 rounded-md border border-border text-fg/60 text-[11px] hover:bg-app transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {threads.length === 0 && !composerOpen && heading && (
        <p className="text-[11.5px] text-fg/35 pl-0.5">No comments yet.</p>
      )}

      <div className="flex flex-col gap-2">
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
    </div>
  )
}

export function DiscussionRail({ vaultPath, feature, type, markdown }: Props): React.ReactElement {
  const [commentsFile, setCommentsFile] = useState<CommentsFile | null>(null)

  useEffect(() => {
    setCommentsFile(null)
    window.chuckle.comments
      .read(vaultPath, feature, type)
      .then(setCommentsFile)
      .catch(() => setCommentsFile({ version: 1, threads: [] }))
  }, [vaultPath, feature, type])

  const headings = extractHeadings(markdown)
  const headingSlugs = new Set(headings.map((h) => h.slug))

  const threads = commentsFile?.threads ?? []

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
  }

  if (commentsFile === null) {
    return (
      <div className="flex-1 grid place-items-center text-[12px] text-fg/40">
        Loading discussions…
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-4">
      <h2 className="text-[11px] font-semibold text-fg/45 mb-4">Discussion</h2>

      {headings.map((h) => (
        <ThreadGroup
          key={h.slug}
          heading={h}
          threads={bySection.get(h.slug) ?? []}
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
          vaultPath={vaultPath}
          feature={feature}
          type={type}
          onRefresh={handleRefresh}
        />
      )}
    </div>
  )
}
