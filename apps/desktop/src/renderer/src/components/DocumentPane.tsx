import React, { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { ApprovalStatus, DocumentType, ReviewResult } from '@shared/ipc-types'
import { humanizeFeature } from '../lib/feature'
import { MermaidDiagram } from './MermaidDiagram'

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

const markdownComponents: Components = {
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
}

function Markdown({ content }: { content: string }): React.ReactElement {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
      components={markdownComponents}
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
}: Props): React.ReactElement {
  const tabs = docTypes ?? [{ type, status: 'not_found' as DocStatus }]
  const [content, setContent] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('read')
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [fullWidth, setFullWidth] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setContent(null)
    setView('read')
    window.chuckle.document
      .read(vaultPath, feature, type)
      .then(setContent)
      .catch((err) => {
        setContent(`Error loading document: ${err instanceof Error ? err.message : String(err)}`)
      })
  }, [vaultPath, feature, type])

  if (content === null) {
    return <div className="flex-1 grid place-items-center text-sm text-fg/40">Loading…</div>
  }

  const editing = view !== 'read'
  const dirty = editing && draft !== content

  function changeView(next: ViewMode): void {
    if (next !== 'read' && view === 'read') setDraft(content ?? '')
    setView(next)
  }

  async function save(): Promise<void> {
    setSaving(true)
    try {
      const result = await window.chuckle.document.write(vaultPath, feature, type, draft)
      setContent(draft)
      setView('read')
      onSaved?.(result)
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
      className={`grid place-items-center w-7 h-7 rounded-md transition ${
        view === mode ? 'bg-surface text-fg shadow-sm' : 'text-fg/45 hover:text-fg/80'
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
      className="grid place-items-center w-7 h-7 rounded-md text-fg/50 hover:text-fg hover:bg-app transition"
    >
      {glyph}
    </button>
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-app min-w-0">
      <header className="bg-surface border-b border-border">
        <div className="max-w-[1100px] mx-auto w-full px-6 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-[13.5px] font-semibold text-fg truncate" title={humanizeFeature(feature)}>
              {humanizeFeature(feature)}
            </h1>
            <div className="flex items-center gap-0.5">
              {tabs.map((t) => {
                const isActive = t.type === type
                return (
                  <button
                    key={t.type}
                    onClick={() => onSelectType?.(t.type)}
                    aria-label={t.type}
                    aria-pressed={isActive}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium capitalize transition-colors ${
                      isActive ? 'bg-app text-fg' : 'text-fg/45 hover:text-fg/80 hover:bg-app/60'
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
            <div className="flex items-center gap-0.5 bg-app rounded-lg p-0.5">
              {viewBtn('read', 'Read', ReadIcon)}
              {viewBtn('split', 'Split', SplitIcon)}
              {viewBtn('edit', 'Edit', CodeIcon)}
            </div>
            {dirty && (
              <>
                <span className="w-px h-5 bg-border mx-1" />
                <button
                  onClick={cancel}
                  disabled={saving}
                  className="text-[12px] font-medium text-fg/60 px-2.5 py-1 rounded-md hover:bg-app transition"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="text-[12px] font-semibold text-white bg-iris px-3 py-1 rounded-md hover:bg-iris-ink disabled:opacity-50 transition"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {view === 'read' && (
        <div className="flex-1 overflow-y-auto">
          <article
            className={`doc mx-auto w-full px-8 py-8 ${fullWidth ? 'max-w-none' : 'max-w-[760px]'}`}
          >
            <Markdown content={content} />
          </article>
        </div>
      )}

      {view === 'edit' && (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="flex-1 resize-none bg-surface font-mono text-[13px] leading-relaxed text-fg/90 px-8 py-8 focus:outline-none"
        />
      )}

      {view === 'split' && (
        <div className="flex-1 flex min-h-0">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className="w-1/2 resize-none bg-surface font-mono text-[13px] leading-relaxed text-fg/90 px-6 py-6 border-r border-border focus:outline-none"
          />
          <div className="w-1/2 overflow-y-auto bg-app">
            <article className="doc w-full px-6 py-6">
              <Markdown content={draft} />
            </article>
          </div>
        </div>
      )}
    </div>
  )
}
