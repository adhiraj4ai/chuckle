import React, { useEffect, useRef, useState } from 'react'
import type { SyncState } from '@shared/ipc-types'
import { AUTO_SYNC_OPTIONS } from '../hooks/useAutoSync'

const PROJECT_DOCS_URL = 'https://github.com/adhiraj4ai/signoff'

interface Props {
  vaultPath: string
  vaultName: string
  syncKey: number
  lastSyncedAt: number | null
  syncing: boolean
  autoSyncMs: number
  onSetAutoSync: (ms: number) => void
  onSyncNow: () => void
  onOpenSourceControl: () => void
  onSwitchVault: () => void
  theme: 'light' | 'dark'
  onSetTheme: (t: 'light' | 'dark') => void
}

function ghRepo(url: string | null): { label: string; web: string | null } {
  if (!url) return { label: 'No remote', web: null }
  const gh = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/)
  if (gh) return { label: `${gh[1]}/${gh[2]}`, web: `https://github.com/${gh[1]}/${gh[2]}` }
  return { label: url.replace(/^https?:\/\//, '').replace(/\.git$/, ''), web: null }
}

function relTime(ts: number | null): string {
  if (!ts) return 'not synced'
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (secs < 10) return 'synced just now'
  if (secs < 60) return `synced ${secs}s ago`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `synced ${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `synced ${hrs}h ago`
  return `synced ${Math.round(hrs / 24)}d ago`
}

const cls =
  'flex items-center gap-1.5 px-2 h-full text-muted hover:text-fg hover:bg-iris-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-iris/40'

const LABEL = 'font-mono text-[10.5px] font-semibold tracking-wide text-muted'

function Sep(): React.ReactElement {
  return <span className="w-px h-3.5 bg-border self-center" />
}

export function StatusBar({
  vaultPath,
  vaultName,
  syncKey,
  lastSyncedAt,
  syncing,
  autoSyncMs,
  onSetAutoSync,
  onSyncNow,
  onOpenSourceControl,
  onSwitchVault,
  theme,
  onSetTheme,
}: Props): React.ReactElement {
  const [remote, setRemote] = useState<string | null>(null)
  const [syncStateData, setSyncStateData] = useState<SyncState | null>(null)
  const [author, setAuthor] = useState<{ name: string; email: string } | null>(null)
  const [open, setOpen] = useState<'identity' | 'vault' | 'settings' | null>(null)
  const [connectMsg, setConnectMsg] = useState<string | null>(null)
  const barRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      window.signoff.vault.getRemote(vaultPath),
      window.signoff.vault.author(vaultPath),
      window.signoff.vault.syncState(vaultPath),
    ])
      .then(([r, a, ss]) => {
        if (!alive) return
        setRemote(r)
        setAuthor(a)
        setSyncStateData(ss)
      })
      .catch(() => {
        // Leave the indicators in their last/empty state instead of throwing an
        // unhandled rejection; the next syncKey bump retries.
      })
    return () => {
      alive = false
    }
  }, [vaultPath, syncKey])

  // close popovers on outside click
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const repo = ghRepo(remote)
  const autoLabel = AUTO_SYNC_OPTIONS.find((o) => o.ms === autoSyncMs)?.label ?? 'Off'

  // One git-status chip stands in for the old remote/sync-state/history/publish
  // buttons: it names the repo and flags the one state that needs attention.
  // Everything else (push, pull, publish, connect, history) lives one click away
  // in the Source-control panel this button opens.
  function gitState(): { label: string; sub: string | null; tone: 'ok' | 'wait' | 'dim' } {
    if (!syncStateData) return { label: '…', sub: null, tone: 'dim' }
    if (!syncStateData.hasRemote) return { label: 'Connect repo', sub: null, tone: 'dim' }
    if (!syncStateData.hasUpstream) return { label: repo.label, sub: 'Publish', tone: 'wait' }
    if (syncStateData.ahead > 0 || syncStateData.behind > 0) {
      return { label: repo.label, sub: `↑${syncStateData.ahead} ↓${syncStateData.behind}`, tone: 'wait' }
    }
    return { label: repo.label, sub: null, tone: 'ok' }
  }
  const git = gitState()
  const toneClass = { ok: 'text-fg/70', wait: 'text-wait', dim: 'text-faint' }[git.tone]

  return (
    <footer
      ref={barRef}
      className="relative h-7 shrink-0 bg-rail border-t border-border flex items-stretch text-[11px] font-mono text-muted"
    >
      {/* Identity */}
      <button className={cls} onClick={() => setOpen(open === 'identity' ? null : 'identity')} title="Reviewer identity">
        <span className="w-1.5 h-1.5 rounded-full bg-ok" />
        <span className="text-fg/70">{author?.name ?? '…'}</span>
      </button>
      {open === 'identity' && author && (
        <Popover>
          <p className="text-fg font-medium">{author.name}</p>
          <p className="text-muted">{author.email}</p>
          <p className="text-faint mt-1 text-[11px]">Decisions are committed under this git identity.</p>
        </Popover>
      )}
      <Sep />

      {/* Vault */}
      <button className={cls} onClick={() => setOpen(open === 'vault' ? null : 'vault')} title="Vault">
        {vaultName}
      </button>
      {open === 'vault' && (
        <Popover>
          <p className="text-fg font-medium">{vaultName}</p>
          <p className="text-muted font-mono text-[11px] truncate">{vaultPath}</p>
          <button
            onClick={() => {
              setOpen(null)
              onSwitchVault()
            }}
            className="mt-2 text-iris hover:text-iris-ink hover:underline text-[12px] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/40"
          >
            Switch project
          </button>
          <button
            onClick={async () => {
              try {
                const { settingsPath } = await window.signoff.vault.connectClaude(vaultPath)
                setConnectMsg(`Wrote ${settingsPath}`)
              } catch (err) {
                setConnectMsg(`Couldn't connect: ${err instanceof Error ? err.message : String(err)}`)
              }
            }}
            className="mt-2 block text-iris hover:text-iris-ink hover:underline text-[12px] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/40"
          >
            Connect to Claude Code
          </button>
          {connectMsg && <p className="mt-1.5 text-[11px] text-muted break-all">{connectMsg}</p>}
          <p className="mt-1.5 text-[11px] text-faint">
            Requires the SignOff npm packages (or use the Claude Code plugin).
          </p>
        </Popover>
      )}

      <span className="flex-1" />

      {/* Git status — names the repo, flags the one state needing attention,
          and opens Source control for push/pull/publish/connect/history. */}
      <button className={cls} onClick={onOpenSourceControl} title="Source control" aria-label="Source control">
        <GitHubMark />
        <span className={toneClass}>{git.label}</span>
        {git.sub && (
          <span className={`px-1.5 py-px rounded-full text-[10px] font-medium ${git.tone === 'wait' ? 'bg-wait-soft text-wait' : 'text-muted'}`}>
            {git.sub}
          </span>
        )}
      </button>

      {/* Sync now — the sync control uses the brand iris on hover */}
      <button
        className="flex items-center gap-1.5 px-2 h-full text-muted hover:text-iris hover:bg-iris-soft transition-colors disabled:opacity-60 disabled:hover:bg-transparent disabled:hover:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-iris/40"
        onClick={onSyncNow}
        disabled={syncing}
        title="Pull and push now"
      >
        <SyncIcon spin={syncing} />
        <span>{syncing ? 'syncing…' : relTime(lastSyncedAt)}</span>
      </button>
      <Sep />

      {/* Docs */}
      <button className={cls} onClick={() => { void window.signoff.openExternal(PROJECT_DOCS_URL).catch(() => {}) }} title="Documentation">
        <BookIcon />
        Docs
      </button>
      <Sep />

      {/* Settings / auto-sync */}
      <button className={cls} onClick={() => setOpen(open === 'settings' ? null : 'settings')} title="Settings" aria-label="Settings">
        <GearIcon />
      </button>
      {open === 'settings' && (
        <Popover align="right">
          <p className={LABEL}>Theme</p>
          <div className="mt-1.5 mb-3 flex gap-1 rounded-lg border border-border bg-app p-1">
            {(['light', 'dark'] as const).map((t) => (
              <button
                key={t}
                onClick={() => onSetTheme(t)}
                className={`flex-1 capitalize rounded-md px-2 py-1 text-[12px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/40 ${
                  theme === t
                    ? 'bg-surface text-iris-ink font-semibold shadow-sm'
                    : 'text-muted hover:text-fg'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <p className={LABEL}>Auto-sync with git</p>
          <div className="mt-1.5 flex flex-col gap-0.5">
            {AUTO_SYNC_OPTIONS.map((o) => (
              <button
                key={o.ms}
                onClick={() => onSetAutoSync(o.ms)}
                className={`flex items-center gap-2 px-2 py-1 rounded-md text-[12px] text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/40 ${
                  o.ms === autoSyncMs ? 'bg-iris-soft text-iris-ink font-semibold' : 'text-fg/70 hover:bg-app'
                }`}
              >
                <span className="w-3 text-iris">{o.ms === autoSyncMs ? '✓' : ''}</span>
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-faint mt-2">Currently: {autoLabel}</p>
        </Popover>
      )}
    </footer>
  )
}

function Popover({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
}): React.ReactElement {
  return (
    <div
      className={`absolute bottom-8 ${align === 'right' ? 'right-2' : 'left-2'} z-40 w-60 rounded-xl border border-border bg-surface shadow-panel p-3 font-sans text-[13px] text-fg`}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

function GitHubMark(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 012-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}
function SyncIcon({ spin }: { spin: boolean }): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 ${spin ? 'motion-safe:animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M13.5 8a5.5 5.5 0 01-9.4 3.9M2.5 8a5.5 5.5 0 019.4-3.9" strokeLinecap="round" />
      <path d="M12 1.5V4.5H9M4 14.5V11.5H7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function BookIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M8 3.5C6.5 2.5 4 2.5 2.5 3v9C4 11.5 6.5 11.5 8 12.5M8 3.5c1.5-1 4-1 5.5-.5v9c-1.5-.5-4-.5-5.5.5M8 3.5v9" strokeLinejoin="round" />
    </svg>
  )
}
function GearIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M13 3l-1.4 1.4M4.4 11.6L3 13" strokeLinecap="round" />
    </svg>
  )
}
