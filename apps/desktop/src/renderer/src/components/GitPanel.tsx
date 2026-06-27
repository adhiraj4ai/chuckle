import React, { useCallback, useEffect, useState } from 'react'
import type { GitCommit, GitStatus } from '@shared/ipc-types'

interface Props {
  vaultPath: string
  onClose: () => void
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function repoLabel(url: string | null): string {
  if (!url) return 'No remote'
  const gh = url.match(/github\.com[:/]([^/]+\/.+?)(?:\.git)?$/)
  return gh ? gh[1] : url
}

export function GitPanel({ vaultPath, onClose }: Props): React.ReactElement {
  const [commits, setCommits] = useState<GitCommit[] | null>(null)
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [remote, setRemote] = useState<string | null>(null)
  const [busy, setBusy] = useState<'push' | 'pull' | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [c, s, r] = await Promise.all([
      window.chuckle.vault.log(vaultPath),
      window.chuckle.vault.status(vaultPath),
      window.chuckle.vault.getRemote(vaultPath),
    ])
    setCommits(c)
    setStatus(s)
    setRemote(r)
  }, [vaultPath])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function push(): Promise<void> {
    setBusy('push')
    setNote(null)
    const r = await window.chuckle.vault.push(vaultPath)
    setNote(r.ok ? 'Pushed to remote.' : `Push failed: ${r.error ?? 'unknown error'}`)
    await refresh()
    setBusy(null)
  }

  async function pull(): Promise<void> {
    setBusy('pull')
    setNote(null)
    try {
      await window.chuckle.vault.sync(vaultPath)
      setNote('Pulled latest from remote.')
    } catch (e) {
      setNote(`Pull failed: ${e instanceof Error ? e.message : String(e)}`)
    }
    await refresh()
    setBusy(null)
  }

  async function publish(): Promise<void> {
    setBusy('push')
    setNote(null)
    const r = await window.chuckle.vault.publishBranch(vaultPath)
    setNote(r.ok ? 'Published branch & set upstream.' : `Publish failed: ${r.error ?? 'unknown error'}`)
    await refresh()
    setBusy(null)
  }

  const ahead = status?.ahead ?? 0
  const behind = status?.behind ?? 0

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-ink/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[460px] max-w-full h-full bg-white border-l border-line shadow-panel flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 h-14 flex items-center justify-between border-b border-line shrink-0">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-ink">Source control</h2>
            <p className="text-[11.5px] font-mono text-ink/45 truncate">{repoLabel(remote)}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close source control"
            className="w-7 h-7 grid place-items-center rounded-md text-ink/40 hover:text-ink hover:bg-mist"
          >
            <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="px-5 py-3 border-b border-line flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 text-[12px] text-ink/60 mr-auto">
            <span className="font-mono text-ink/80">{status?.branch ?? '—'}</span>
            {status?.tracking ? (
              <span className="flex items-center gap-1.5 text-ink/45">
                <span title="commits to push">↑ {ahead}</span>
                <span title="commits to pull">↓ {behind}</span>
              </span>
            ) : (
              <span className="text-ink/35">no upstream</span>
            )}
          </div>
          <button
            onClick={pull}
            disabled={busy !== null}
            className="text-[12px] font-medium px-2.5 py-1 rounded-md border border-line text-ink/70 hover:bg-mist disabled:opacity-50"
          >
            {busy === 'pull' ? 'Pulling…' : 'Pull'}
          </button>
          {!status?.tracking && remote ? (
            <button
              onClick={publish}
              disabled={busy !== null}
              className="text-[12px] font-semibold px-2.5 py-1 rounded-md bg-iris text-white hover:bg-iris-ink disabled:opacity-50"
            >
              {busy === 'push' ? 'Publishing…' : 'Publish branch'}
            </button>
          ) : (
            <button
              onClick={push}
              disabled={busy !== null || !status?.tracking}
              className="text-[12px] font-semibold px-2.5 py-1 rounded-md bg-iris text-white hover:bg-iris-ink disabled:opacity-50"
            >
              {busy === 'push' ? 'Pushing…' : `Push${ahead ? ` (${ahead})` : ''}`}
            </button>
          )}
        </div>

        {note && (
          <div className="px-5 py-2 text-[12px] text-ink/55 bg-mist border-b border-line shrink-0">{note}</div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {commits === null ? (
            <p className="text-[12px] text-ink/40">Loading history…</p>
          ) : commits.length === 0 ? (
            <p className="text-[12px] text-ink/40">No commits yet.</p>
          ) : (
            <ol className="relative">
              {commits.map((c, i) => {
                const unpushed = i < ahead
                return (
                  <li key={c.hash} className="relative pl-6 pb-4 last:pb-0">
                    {/* graph line */}
                    {i < commits.length - 1 && (
                      <span className="absolute left-[5px] top-3 bottom-0 w-px bg-line" />
                    )}
                    {/* graph dot */}
                    <span
                      className={`absolute left-0 top-1 w-[11px] h-[11px] rounded-full ring-2 ring-white ${
                        unpushed ? 'bg-wait' : 'bg-iris'
                      }`}
                      title={unpushed ? 'not pushed yet' : 'pushed'}
                    />
                    <div className="flex items-baseline gap-2">
                      <p className="text-[13px] text-ink leading-snug flex-1 min-w-0">{c.message}</p>
                      <span className="font-mono text-[11px] text-ink/35 shrink-0">{c.short}</span>
                    </div>
                    <p className="text-[11.5px] text-ink/45 mt-0.5">
                      {c.author} · {relTime(c.date)}
                      {c.refs && <span className="ml-1.5 text-iris">{c.refs}</span>}
                    </p>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}
