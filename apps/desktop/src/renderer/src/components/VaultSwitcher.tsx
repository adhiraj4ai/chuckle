import React, { useEffect, useRef, useState } from 'react'
import type { VaultInfo } from '@shared/ipc-types'
import { Logo } from './Logo'

interface Props {
  onVaultSelected: (vaultPath: string, vaultName: string) => void
}

/** The last path segment of a folder, used as the default project name. */
function basename(dir: string): string {
  return dir.split(/[\\/]/).filter(Boolean).pop() || 'project'
}

export function VaultSwitcher({ onVaultSelected }: Props): React.ReactElement {
  const [vaults, setVaults] = useState<VaultInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [setupDir, setSetupDir] = useState<string | null>(null)
  const [setupName, setSetupName] = useState('')
  const [setupApprovers, setSetupApprovers] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const busyRef = useRef(false)

  useEffect(() => {
    window.chuckle.vault.list().then(setVaults)
  }, [])

  async function handleOpenVault(): Promise<void> {
    setError(null)
    try {
      const dir = await window.chuckle.vault.selectDirectory()
      if (!dir) return
      const vault = await window.chuckle.vault.openExisting(dir)
      onVaultSelected(vault.path, vault.name)
    } catch (e) {
      setError(`Couldn't open that folder: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function handleRemove(vaultPath: string): Promise<void> {
    await window.chuckle.vault.remove(vaultPath)
    setVaults((prev) => (prev ? prev.filter((v) => v.path !== vaultPath) : prev))
  }

  async function handleSetupClick(): Promise<void> {
    setError(null)
    const dir = await window.chuckle.vault.selectDirectory()
    if (!dir) return
    setSetupDir(dir)
    setSetupName(basename(dir))
    setSetupApprovers('')
  }

  async function handleConfirmSetup(): Promise<void> {
    if (busyRef.current) return
    if (!setupDir) return
    const trimmedName = setupName.trim()
    if (!trimmedName) return
    const parsedApprovers = setupApprovers
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
    busyRef.current = true
    setBusy(true)
    setProgress(null)
    const unsub = window.chuckle.vault.onSetupProgress((p) => setProgress(p)) ?? (() => {})
    try {
      const vault = await window.chuckle.vault.create(setupDir, trimmedName, parsedApprovers)
      setSetupDir(null)
      onVaultSelected(vault.path, vault.name)
    } catch (e) {
      setError(`Setup failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      busyRef.current = false
      unsub()
      setBusy(false)
      setProgress(null)
    }
  }

  function handleCancelSetup(): void {
    setSetupDir(null)
    setSetupName('')
    setSetupApprovers('')
    setError(null)
  }

  if (vaults === null) {
    return <div className="min-h-screen grid place-items-center text-sm text-fg/40">Loading…</div>
  }

  return (
    <div className="min-h-screen bg-app flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-1">
          <Logo size={38} />
          <h1
            className="text-[42px] leading-none text-fg pr-1"
            style={{ fontFamily: "'SignPainter', 'SignPainter-HouseScript', 'Brush Script MT', cursive", fontWeight: 700 }}
          >
            Signoff
          </h1>
        </div>
        <p className="text-fg/50 text-[14px] mb-8 pl-0.5">
          Review and approve specs &amp; plans before the code gets written.
        </p>

        {vaults.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface/60 px-5 py-8 text-center mb-5">
            <p className="text-[13.5px] text-fg/55">
              No projects yet. Set Signoff up in a project, or open an existing vault.
            </p>
          </div>
        ) : (
          <div className="mb-5">
            <h2 className="text-[11px] font-semibold text-fg/45 mb-2">Recent projects</h2>
            <ul className="bg-surface border border-border rounded-xl shadow-panel overflow-hidden">
              {vaults.map((v) => (
                <li key={v.path} className="group/row relative border-b border-border last:border-b-0">
                  <button
                    onClick={() => onVaultSelected(v.path, v.name)}
                    className="w-full text-left pl-4 pr-10 py-3 hover:bg-app transition-colors flex items-center gap-3"
                  >
                    <span className="grid place-items-center w-8 h-8 rounded-lg bg-iris-soft text-iris text-[13px] font-semibold shrink-0">
                      {v.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium text-[14px] text-fg truncate">{v.name}</span>
                      <span className="block text-[11.5px] text-fg/40 font-mono truncate">{v.path}</span>
                    </span>
                  </button>
                  <button
                    onClick={() => handleRemove(v.path)}
                    aria-label={`Remove ${v.name} from recent projects`}
                    title="Remove from recent projects"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center rounded-md text-fg/30 hover:text-fg hover:bg-border opacity-0 group-hover/row:opacity-100 focus:opacity-100 transition"
                  >
                    <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {busy ? (
          <div className="rounded-xl border border-border bg-surface/60 px-5 py-6">
            {progress && progress.total > 0 ? (
              <>
                <div
                  role="progressbar"
                  aria-valuenow={progress.done}
                  aria-valuemin={0}
                  aria-valuemax={progress.total}
                  className="h-1.5 rounded-full bg-border overflow-hidden"
                >
                  <div
                    className="h-full bg-iris transition-all"
                    style={{ width: `${(progress.done / progress.total) * 100}%` }}
                  />
                </div>
                <p className="text-[12px] text-fg/50 mt-1">
                  {progress.done < progress.total
                    ? `Configuring ${progress.done} of ${progress.total}…`
                    : 'Finalizing…'}
                </p>
              </>
            ) : (
              <p className="text-[13px] text-fg/50 text-center">Setting up…</p>
            )}
          </div>
        ) : setupDir !== null ? (
          <div className="rounded-xl border border-border bg-surface px-5 py-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="setup-project-name" className="text-[11px] font-semibold text-fg/50">
                Project name
              </label>
              <input
                id="setup-project-name"
                aria-label="Project name"
                type="text"
                value={setupName}
                onChange={(e) => setSetupName(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface text-fg/80 px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-iris"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="setup-approvers" className="text-[11px] font-semibold text-fg/50">
                Approvers
              </label>
              <textarea
                id="setup-approvers"
                aria-label="Approvers"
                placeholder="lead@example.com, arch@example.com"
                value={setupApprovers}
                onChange={(e) => setSetupApprovers(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border bg-surface text-fg/80 px-3 py-2 text-[13px] resize-none focus:outline-none focus:ring-1 focus:ring-iris"
              />
              <p className="text-[11.5px] text-fg/40 leading-snug">
                Approvers sign off using their git email — leave empty to let anyone approve.
              </p>
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={handleConfirmSetup}
                disabled={busy}
                className="flex-1 px-4 py-2.5 rounded-lg bg-iris text-white text-[13px] font-semibold hover:bg-iris-ink active:brightness-95 disabled:opacity-50 transition"
              >
                Create
              </button>
              <button
                onClick={handleCancelSetup}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-surface text-fg/80 text-[13px] font-medium hover:bg-app transition"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-2.5">
              <button
                onClick={handleSetupClick}
                disabled={busy}
                className="flex-1 px-4 py-2.5 rounded-lg bg-iris text-white text-[13px] font-semibold hover:bg-iris-ink active:brightness-95 disabled:opacity-50 transition"
              >
                Set up in a project
              </button>
              <button
                onClick={handleOpenVault}
                disabled={busy}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-surface text-fg/80 text-[13px] font-medium hover:bg-app disabled:opacity-50 transition"
              >
                Open
              </button>
            </div>
            <p className="mt-3 text-[12px] text-fg/40 leading-relaxed">
              Setup picks your project folder and creates a{' '}
              <span className="font-mono text-fg/60">.signoff/</span> vault inside it — its own git repo,
              kept out of the project&apos;s own git.
            </p>
          </>
        )}

        {error && (
          <p className="mt-3 text-[12.5px] text-stop bg-stop-soft border border-stop/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
