import React, { useCallback, useEffect, useState } from 'react'
import type { GitCommit, GitErrorKind, SyncState } from '@shared/ipc-types'

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

function repoLabel(syncState: SyncState | null, remote: string | null): string {
  if (!syncState?.hasRemote || !remote) return 'No remote'
  const gh = remote.match(/github\.com[:/]([^/]+\/.+?)(?:\.git)?$/)
  return gh ? gh[1] : remote
}

function errorMsg(error: string | undefined, errorKind: GitErrorKind | undefined): string {
  if (errorKind === 'auth') {
    return "Couldn't authenticate — run `gh auth login` or add an SSH key, then retry."
  }
  return error ?? 'Unknown error'
}

export function GitPanel({ vaultPath, onClose }: Props): React.ReactElement {
  const [commits, setCommits] = useState<GitCommit[] | null>(null)
  const [syncState, setSyncState] = useState<SyncState | null>(null)
  const [remote, setRemote] = useState<string | null>(null)
  const [busy, setBusy] = useState<'push' | 'pull' | 'connect' | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [connectUrl, setConnectUrl] = useState('')
  const [connectError, setConnectError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [c, s, r] = await Promise.all([
      window.signoff.vault.log(vaultPath),
      window.signoff.vault.syncState(vaultPath),
      window.signoff.vault.getRemote(vaultPath),
    ])
    setCommits(c)
    setSyncState(s)
    setRemote(r)
  }, [vaultPath])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function connectRemote(): Promise<void> {
    setBusy('connect')
    setConnectError(null)
    const r = await window.signoff.vault.connectRemote(vaultPath, connectUrl)
    if (r.ok) {
      setConnectUrl('')
      await refresh()
    } else {
      setConnectError(errorMsg(r.error, r.errorKind))
    }
    setBusy(null)
  }

  async function push(): Promise<void> {
    setBusy('push')
    setNote(null)
    const r = await window.signoff.vault.push(vaultPath)
    if (r.ok) {
      setNote('Pushed to remote.')
    } else {
      setNote(`Push failed: ${errorMsg(r.error, r.errorKind)}`)
    }
    await refresh()
    setBusy(null)
  }

  async function pull(): Promise<void> {
    setBusy('pull')
    setNote(null)
    try {
      await window.signoff.vault.sync(vaultPath)
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
    const r = await window.signoff.vault.publishBranch(vaultPath)
    if (r.ok) {
      setNote('Published branch & set upstream.')
    } else {
      setNote(`Publish failed: ${errorMsg(r.error, r.errorKind)}`)
    }
    await refresh()
    setBusy(null)
  }

  const ahead = syncState?.ahead ?? 0
  const behind = syncState?.behind ?? 0
  const hasRemote = syncState?.hasRemote ?? false
  const hasUpstream = syncState?.hasUpstream ?? false
  const ghMatch = remote?.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/)
  const webUrl = ghMatch ? `https://github.com/${ghMatch[1]}/${ghMatch[2]}` : null

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-ink/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[460px] max-w-full h-full bg-surface border-l border-border shadow-panel flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 h-14 flex items-center justify-between border-b border-border shrink-0">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-fg">Source control</h2>
            {webUrl ? (
              <button
                onClick={() => { void window.signoff.openExternal(webUrl).catch(() => {}) }}
                title="Open on GitHub"
                className="text-[11.5px] font-mono text-fg/45 hover:text-iris truncate max-w-full inline-flex items-center gap-1"
              >
                {repoLabel(syncState, remote)}
                <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M4.5 2.5h5v5M9.5 2.5l-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : (
              <p className="text-[11.5px] font-mono text-fg/45 truncate">{repoLabel(syncState, remote)}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close source control"
            className="w-7 h-7 grid place-items-center rounded-md text-fg/40 hover:text-fg hover:bg-app"
          >
            <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {/* Connect remote form — shown when no remote configured */}
        {!hasRemote && (
          <div className="px-5 py-4 border-b border-border shrink-0 space-y-2">
            <p className="text-[12px] font-medium text-fg/70">Connect a remote repository</p>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 rounded-md border border-border bg-app px-3 py-1.5 text-[12px] text-fg placeholder:text-fg/35 focus:outline-none focus:ring-2 focus:ring-iris/30"
                placeholder="git URL (e.g. git@github.com:org/repo.git)"
                value={connectUrl}
                onChange={(e) => setConnectUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void connectRemote() }}
              />
              <button
                onClick={() => void connectRemote()}
                disabled={busy !== null || connectUrl.trim() === ''}
                className="text-[12px] font-semibold px-3 py-1.5 rounded-md bg-iris text-white hover:bg-iris-ink disabled:opacity-50"
              >
                {busy === 'connect' ? 'Connecting…' : 'Connect'}
              </button>
            </div>
            {connectError && (
              <p className="text-[12px] text-stop leading-relaxed">{connectError}</p>
            )}
          </div>
        )}

        {/* Sync controls — shown when remote is configured */}
        {hasRemote && (
          <div className="px-5 py-3 border-b border-border flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-2 text-[12px] text-fg/60 mr-auto">
              <span className="font-mono text-fg/80">{syncState?.branch ?? '—'}</span>
              {hasUpstream ? (
                <span className="flex items-center gap-1.5 text-fg/45">
                  <span title="commits to push">↑ {ahead}</span>
                  <span title="commits to pull">↓ {behind}</span>
                </span>
              ) : (
                <span className="text-fg/35">no upstream</span>
              )}
            </div>
            {hasUpstream && (
              <button
                onClick={() => void pull()}
                disabled={busy !== null}
                className="text-[12px] font-medium px-2.5 py-1 rounded-md border border-border text-fg/70 hover:bg-app disabled:opacity-50"
              >
                {busy === 'pull' ? 'Pulling…' : 'Pull'}
              </button>
            )}
            {!hasUpstream ? (
              <button
                onClick={() => void publish()}
                disabled={busy !== null}
                className="text-[12px] font-semibold px-2.5 py-1 rounded-md bg-iris text-white hover:bg-iris-ink disabled:opacity-50"
              >
                {busy === 'push' ? 'Publishing…' : 'Publish branch'}
              </button>
            ) : (
              <button
                onClick={() => void push()}
                disabled={busy !== null}
                className="text-[12px] font-semibold px-2.5 py-1 rounded-md bg-iris text-white hover:bg-iris-ink disabled:opacity-50"
              >
                {busy === 'push' ? 'Pushing…' : `Push${ahead ? ` (${ahead})` : ''}`}
              </button>
            )}
          </div>
        )}

        {note && (
          <div className="px-5 py-2 text-[12px] text-fg/55 bg-app border-b border-border shrink-0">{note}</div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {commits === null ? (
            <p className="text-[12px] text-fg/40">Loading history…</p>
          ) : commits.length === 0 ? (
            <p className="text-[12px] text-fg/40">No commits yet.</p>
          ) : (
            <ol className="relative">
              {commits.map((c, i) => {
                const unpushed = i < ahead
                return (
                  <li key={c.hash} className="relative pl-6 pb-4 last:pb-0">
                    {/* graph line */}
                    {i < commits.length - 1 && (
                      <span className="absolute left-[5px] top-3 bottom-0 w-px bg-border" />
                    )}
                    {/* graph dot */}
                    <span
                      className={`absolute left-0 top-1 w-[11px] h-[11px] rounded-full ring-2 ring-white ${
                        unpushed ? 'bg-wait' : 'bg-iris'
                      }`}
                      title={unpushed ? 'not pushed yet' : 'pushed'}
                    />
                    <div className="flex items-baseline gap-2">
                      <p className="text-[13px] text-fg leading-snug flex-1 min-w-0">{c.message}</p>
                      <span className="font-mono text-[11px] text-fg/35 shrink-0">{c.short}</span>
                    </div>
                    <p className="text-[11.5px] text-fg/45 mt-0.5">
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
