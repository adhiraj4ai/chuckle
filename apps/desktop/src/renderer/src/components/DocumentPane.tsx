import React, { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { ApprovalStatus, DocumentType, ReviewResult } from '@shared/ipc-types'
import { humanizeFeature } from '../lib/feature'
import { slugifyHeading } from '../lib/headings.js'
import { MermaidDiagram } from './MermaidDiagram'

/** A request to comment on part of the document, raised from a heading button
 *  or a text selection. `quote` is the selected text (Word-style inline comment). */
export interface CommentRequest {
  slug: string
  text: string
  quote?: string
}

/** Recursively collect text from a React markdown node (survives hljs token spans). */
function nodeText(node: React.ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return nodeText((node as { props: { children?: React.ReactNode } }).props.children)
  }
  return ''
}

const CommentGlyph = (): React.ReactElement => (
  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
    <path d="M2 3.5C2 3 2.4 2.5 3 2.5h10c.6 0 1 .5 1 1v6c0 .5-.4 1-1 1H6l-3 2.5V3.5z" strokeLinejoin="round" />
    <path d="M6 6h5M6 8h3" strokeLinecap="round" />
  </svg>
)

/** Build markdown renderers. When `onComment` is supplied, headings gain a
 *  hover "add comment" button that anchors a thread to that section. */
function makeComponents(onComment?: (r: CommentRequest) => void): Components {
  const heading =
    (level: 1 | 2 | 3) =>
    function H({ children }: { children?: React.ReactNode }): React.ReactElement {
      const Tag = `h${level}` as 'h1'
      const text = nodeText(children)
      const slug = slugifyHeading(text)
      return (
        <Tag data-slug={slug} className="group/h">
          {children}
          {onComment && (
            <button
              type="button"
              contentEditable={false}
              onClick={() => onComment({ slug, text })}
              aria-label={`Comment on ${text}`}
              title={`Comment on ${text}`}
              className="ml-2 align-middle inline-flex items-center justify-center w-6 h-6 rounded-md text-faint opacity-0 group-hover/h:opacity-100 focus:opacity-100 hover:text-iris hover:bg-iris-soft transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-iris/40 align-middle"
            >
              <CommentGlyph />
            </button>
          )}
        </Tag>
      )
    }

  return {
    pre(props) {
      const { children } = props
      const child = Array.isArray(children) ? children[0] : children
      const className =
        child && typeof child === 'object' && 'props' in child
          ? ((child as { props: { className?: string } }).props.className ?? '')
          : ''
      if (/language-mermaid/.test(className)) {
        return <MermaidDiagram code={nodeText(child).replace(/\n$/, '')} />
      }
      return <pre>{children}</pre>
    },
    h1: heading(1),
    h2: heading(2),
    h3: heading(3),
  }
}

/** A commented span to highlight in the rendered document. */
export interface QuoteMark {
  quote: string
  section: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** rehype plugin: wrap the first occurrence of each commented quote (within a
 *  single text node, outside code) in a clickable <mark>. */
function rehypeQuoteMarks(marks: QuoteMark[]) {
  const active = marks.filter((m) => m.quote.trim().length > 0)
  return () => (tree: any): void => {
    if (!active.length) return
    const walk = (node: any): void => {
      if (!node || !Array.isArray(node.children)) return
      if (node.tagName === 'pre' || node.tagName === 'code') return
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (child.type === 'text') {
          for (const m of active) {
            const idx = child.value.indexOf(m.quote)
            if (idx === -1) continue
            const before = child.value.slice(0, idx)
            const after = child.value.slice(idx + m.quote.length)
            const mark = {
              type: 'element',
              tagName: 'mark',
              properties: { className: ['sio-comment'], dataSection: m.section },
              children: [{ type: 'text', value: m.quote }],
            }
            const repl: any[] = []
            if (before) repl.push({ type: 'text', value: before })
            repl.push(mark)
            if (after) repl.push({ type: 'text', value: after })
            node.children.splice(i, 1, ...repl)
            i += repl.length - 1
            break
          }
        } else {
          walk(child)
        }
      }
    }
    walk(tree)
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function Markdown({
  content,
  onComment,
  marks,
}: {
  content: string
  onComment?: (r: CommentRequest) => void
  marks?: QuoteMark[]
}): React.ReactElement {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }], rehypeQuoteMarks(marks ?? [])]}
      components={makeComponents(onComment)}
    >
      {content}
    </ReactMarkdown>
  )
}

type ViewMode = 'read' | 'split' | 'edit'
type DocStatus = ApprovalStatus | 'not_found'

interface Props {
  vaultPath: string
  feature: string
  type: DocumentType
  /** The feature's available document tabs (defaults to just the open type). */
  docTypes?: { type: DocumentType; status: DocStatus }[]
  /** Switch the open document type within this feature. */
  onSelectType?: (type: DocumentType) => void
  onSaved?: (result: ReviewResult) => void
  /** Raised when the reader asks to comment on a heading or a text selection. */
  onComment?: (req: CommentRequest) => void
  /** Bumped when comments change so highlighted quotes re-read. */
  commentsVersion?: number
  /** Raised when a commented (highlighted) span is clicked, to open its thread. */
  onFocusSection?: (slug: string) => void
}

function statusDot(status: DocStatus): string {
  if (status === 'pending') return 'bg-wait'
  if (status === 'approved') return 'bg-ok'
  if (status === 'rejected') return 'bg-stop'
  return 'bg-fg/20'
}

// --- toolbar icons (16px line icons) ---
const icon = 'w-[15px] h-[15px]'
const ReadIcon = (): React.ReactElement => (
  <svg viewBox="0 0 16 16" className={icon} fill="none" stroke="currentColor" strokeWidth="1.3">
    <path d="M2 4.5C2 4 2.4 3.5 3 3.5h4c.6 0 1 .5 1 1V13c0-.5-.4-1-1-1H3c-.6 0-1-.5-1-1V4.5zM14 4.5c0-.5-.4-1-1-1H9c-.6 0-1 .5-1 1V13c0-.5.4-1 1-1h4c.6 0 1-.5 1-1V4.5z" strokeLinejoin="round" />
  </svg>
)
const SplitIcon = (): React.ReactElement => (
  <svg viewBox="0 0 16 16" className={icon} fill="none" stroke="currentColor" strokeWidth="1.3">
    <rect x="2" y="3" width="12" height="10" rx="1.2" />
    <path d="M8 3v10" />
  </svg>
)
const CodeIcon = (): React.ReactElement => (
  <svg viewBox="0 0 16 16" className={icon} fill="none" stroke="currentColor" strokeWidth="1.3">
    <path d="M6 5L3 8l3 3M10 5l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const ListIcon = (): React.ReactElement => (
  <svg viewBox="0 0 16 16" className={icon} fill="none" stroke="currentColor" strokeWidth="1.3">
    <path d="M5.5 4.5h8M5.5 8h8M5.5 11.5h8" strokeLinecap="round" />
    <circle cx="2.7" cy="4.5" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="2.7" cy="8" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="2.7" cy="11.5" r="0.8" fill="currentColor" stroke="none" />
  </svg>
)
const LinkIcon = (): React.ReactElement => (
  <svg viewBox="0 0 16 16" className={icon} fill="none" stroke="currentColor" strokeWidth="1.3">
    <path d="M6.5 9.5l3-3M7 4.5l.7-.7a2.3 2.3 0 013.3 3.3l-.7.7M9 11.5l-.7.7a2.3 2.3 0 01-3.3-3.3l.7-.7" strokeLinecap="round" />
  </svg>
)
const CopyIcon = (): React.ReactElement => (
  <svg viewBox="0 0 16 16" className={icon} fill="none" stroke="currentColor" strokeWidth="1.3">
    <rect x="5" y="5" width="8" height="9" rx="1.2" />
    <path d="M3 11V3.2c0-.6.5-1.2 1.2-1.2H10" strokeLinecap="round" />
  </svg>
)
const WidthIcon = ({ full }: { full: boolean }): React.ReactElement =>
  full ? (
    <svg viewBox="0 0 16 16" className={icon} fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M7 3L4 8l3 5M9 3l3 5-3 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" className={icon} fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M5.5 3L2.5 8l3 5M10.5 3l3 5-3 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )

export function DocumentPane({
  vaultPath,
  feature,
  type,
  docTypes,
  onSelectType,
  onSaved,
  onComment,
  commentsVersion,
  onFocusSection,
}: Props): React.ReactElement {
  const tabs = docTypes ?? [{ type, status: 'not_found' as DocStatus }]
  const [content, setContent] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('read')
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Full width is the default reading layout; remembered across sessions.
  const [fullWidth, setFullWidth] = useState(() => localStorage.getItem('signoff.fullWidth') !== 'false')
  const [marks, setMarks] = useState<QuoteMark[]>([])

  useEffect(() => {
    localStorage.setItem('signoff.fullWidth', String(fullWidth))
  }, [fullWidth])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const readRef = useRef<HTMLDivElement>(null)

  // Load commented quotes to highlight in the document (unresolved threads only).
  useEffect(() => {
    let alive = true
    Promise.resolve(window.signoff.comments.read(vaultPath, feature, type))
      .then((file) => {
        if (!alive) return
        const qs = (file?.threads ?? [])
          .filter((t) => !t.resolved && typeof t.quote === 'string' && t.quote.trim().length > 0)
          .map((t) => ({ quote: t.quote as string, section: t.section }))
        setMarks(qs)
      })
      .catch(() => {
        if (alive) setMarks([])
      })
    return () => {
      alive = false
    }
  }, [vaultPath, feature, type, commentsVersion])

  // Open the thread for a clicked highlight.
  function handleDocClick(e: React.MouseEvent): void {
    if (!onFocusSection) return
    const mark = (e.target as HTMLElement).closest('mark.sio-comment')
    if (mark) onFocusSection(mark.getAttribute('data-section') ?? '')
  }
  // Floating "Comment" button shown for a text selection (Word-style inline comment).
  const [selection, setSelection] = useState<{ quote: string; slug: string; text: string; x: number; y: number } | null>(null)

  // Resolve the section a text selection sits in by finding the nearest heading
  // above it, then surface a floating Comment button anchored to the selection.
  function handleTextSelection(): void {
    if (!onComment || !readRef.current) return
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setSelection(null)
      return
    }
    const quote = sel.toString().trim()
    const range = sel.getRangeAt(0)
    if (!quote || !readRef.current.contains(range.commonAncestorContainer)) {
      setSelection(null)
      return
    }
    const rect = range.getBoundingClientRect()
    let slug = ''
    let text = 'the document'
    readRef.current.querySelectorAll<HTMLElement>('[data-slug]').forEach((h) => {
      if (h.getBoundingClientRect().top <= rect.top + 1) {
        slug = h.getAttribute('data-slug') ?? ''
        text = (h.textContent ?? '').trim() || text
      }
    })
    setSelection({ quote, slug, text, x: rect.left + rect.width / 2, y: rect.top })
  }

  function commentOnSelection(): void {
    if (!selection || !onComment) return
    onComment({ slug: selection.slug, text: selection.text, quote: selection.quote })
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }

  useEffect(() => {
    let alive = true
    setContent(null)
    setView('read')
    window.signoff.document
      .read(vaultPath, feature, type)
      .then((c) => {
        if (alive) setContent(c)
      })
      .catch((err) => {
        if (alive) setContent(`Error loading document: ${err instanceof Error ? err.message : String(err)}`)
      })
    return () => {
      alive = false
    }
  }, [vaultPath, feature, type])

  if (content === null) {
    return <div className="flex-1 grid place-items-center text-sm text-faint">Loading…</div>
  }

  const editing = view !== 'read'
  const dirty = editing && draft !== content

  function changeView(next: ViewMode): void {
    if (next !== 'read' && view === 'read') setDraft(content ?? '')
    setView(next)
  }

  async function save(): Promise<void> {
    setSaving(true)
    setSaveError(null)
    try {
      const result = await window.signoff.document.write(vaultPath, feature, type, draft)
      setContent(draft)
      setView('read')
      onSaved?.(result)
    } catch (e) {
      // Keep the editor open with the draft intact so the user can retry.
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  function cancel(): void {
    setDraft(content ?? '')
    setView('read')
  }

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(editing ? draft : content ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  // wrap the current selection with markers (bold/italic/code/link)
  function wrap(before: string, after: string): void {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = draft.slice(start, end)
    const next = draft.slice(0, start) + before + selected + after + draft.slice(end)
    setDraft(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + before.length, end + before.length)
    })
  }

  // prefix every selected line (lists)
  function linePrefix(prefix: string): void {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const lineStart = draft.lastIndexOf('\n', start - 1) + 1
    const block = draft.slice(lineStart, end)
    const prefixed = block
      .split('\n')
      .map((l) => prefix + l)
      .join('\n')
    const next = draft.slice(0, lineStart) + prefixed + draft.slice(end)
    setDraft(next)
    requestAnimationFrame(() => ta.focus())
  }

  const viewBtn = (mode: ViewMode, label: string, Glyph: () => React.ReactElement): React.ReactElement => (
    <button
      onClick={() => changeView(mode)}
      title={label}
      aria-label={label}
      aria-pressed={view === mode}
      className={`grid place-items-center w-7 h-7 rounded-md transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/40 ${
        view === mode ? 'bg-iris text-white shadow-sm' : 'text-muted hover:text-iris-ink hover:bg-surface'
      }`}
    >
      <Glyph />
    </button>
  )

  const formatBtn = (label: string, glyph: React.ReactNode, onClick: () => void): React.ReactElement => (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid place-items-center w-7 h-7 rounded-md text-muted hover:text-iris-ink hover:bg-iris-soft transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/40"
    >
      {glyph}
    </button>
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-app min-w-0">
      <header className="bg-surface border-b border-border">
        <div className="max-w-[1100px] mx-auto w-full px-6 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <h1 className="text-[13.5px] font-semibold text-fg truncate" title={humanizeFeature(feature)}>
              {humanizeFeature(feature)}
            </h1>
            {/* Doc-type tabs — segmented control on a bg-app track */}
            <div className="flex items-center gap-1 bg-app p-1 rounded-lg border border-border">
              {tabs.map((t) => {
                const isActive = t.type === type
                return (
                  <button
                    key={t.type}
                    onClick={() => onSelectType?.(t.type)}
                    aria-label={t.type}
                    aria-pressed={isActive}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] capitalize transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/40 ${
                      isActive
                        ? 'bg-surface text-iris-ink shadow-sm font-semibold'
                        : 'text-muted hover:text-iris-ink font-medium'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${statusDot(t.status)}`} />
                    {t.type}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {editing && (
              <>
                {formatBtn('Bold', <span className="text-[13px] font-bold">B</span>, () => wrap('**', '**'))}
                {formatBtn('Italic', <span className="text-[13px] italic font-serif">I</span>, () => wrap('_', '_'))}
                {formatBtn('Inline code', <span className="font-mono text-[12px]">{'</>'}</span>, () => wrap('`', '`'))}
                {formatBtn('List', <ListIcon />, () => linePrefix('- '))}
                {formatBtn('Link', <LinkIcon />, () => wrap('[', '](url)'))}
                <span className="w-px h-5 bg-border mx-1" />
              </>
            )}
            {formatBtn(copied ? 'Copied!' : 'Copy markdown', <CopyIcon />, copy)}
            {view === 'read' &&
              formatBtn(fullWidth ? 'Center content' : 'Full width', <WidthIcon full={fullWidth} />, () =>
                setFullWidth((v) => !v)
              )}
            <span className="w-px h-5 bg-border mx-1" />
            {/* View-mode — segmented control, active = iris */}
            <div className="flex items-center gap-0.5 bg-app rounded-lg p-1 border border-border">
              {viewBtn('read', 'Read', ReadIcon)}
              {viewBtn('split', 'Split', SplitIcon)}
              {viewBtn('edit', 'Edit', CodeIcon)}
            </div>
            {saveError && (
              <span className="text-[11.5px] text-stop max-w-[280px] truncate" title={saveError} role="alert">
                {saveError}
              </span>
            )}
            {dirty && (
              <>
                <span className="w-px h-5 bg-border mx-1" />
                <button
                  onClick={cancel}
                  disabled={saving}
                  className="text-[12px] font-medium text-muted px-2.5 py-1 rounded-md hover:text-iris-ink hover:bg-iris-soft transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/40"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="text-[12px] font-semibold text-white bg-iris px-3 py-1 rounded-md hover:bg-iris-ink disabled:opacity-50 transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/40"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {view === 'read' && (
        <div
          ref={readRef}
          className="flex-1 overflow-y-auto px-6 py-8"
          onMouseUp={handleTextSelection}
          onMouseDown={() => setSelection(null)}
          onScroll={() => selection && setSelection(null)}
          onClick={handleDocClick}
        >
          {fullWidth ? (
            <article className="doc mx-auto w-full max-w-none bg-surface border border-border rounded-xl shadow-panel px-10 py-10">
              <Markdown content={content} onComment={onComment} marks={marks} />
            </article>
          ) : (
            <article className="doc mx-auto w-full max-w-[680px] bg-surface border border-border rounded-xl shadow-panel px-10 py-10">
              <Markdown content={content} onComment={onComment} marks={marks} />
            </article>
          )}
          {selection && onComment && (
            <button
              type="button"
              onMouseDown={(e) => {
                // Keep the selection alive and stop the container's onMouseDown
                // (which clears it) from unmounting this button before the click.
                e.preventDefault()
                e.stopPropagation()
              }}
              onClick={commentOnSelection}
              style={{ position: 'fixed', left: selection.x, top: selection.y - 10 }}
              className="z-50 -translate-x-1/2 -translate-y-full flex items-center gap-1.5 rounded-lg bg-iris text-white text-[12px] font-medium px-2.5 py-1.5 shadow-panel hover:bg-iris-ink transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-iris/40"
            >
              <CommentGlyph />
              Comment
            </button>
          )}
        </div>
      )}

      {view === 'edit' && (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="flex-1 resize-none bg-surface font-mono text-[13px] leading-relaxed text-fg/90 px-8 py-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-iris/40"
        />
      )}

      {view === 'split' && (
        <div className="flex-1 flex min-h-0">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className="w-1/2 resize-none bg-surface font-mono text-[13px] leading-relaxed text-fg/90 px-6 py-6 border-r border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-iris/40"
          />
          <div className="w-1/2 overflow-y-auto bg-app px-6 py-6">
            <article className="doc mx-auto w-full max-w-[680px] bg-surface border border-border rounded-xl shadow-panel px-8 py-8">
              <Markdown content={draft} />
            </article>
          </div>
        </div>
      )}
    </div>
  )
}
