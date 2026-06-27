import React, { useEffect, useState } from 'react'
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

  async function handleCreateVault(): Promise<void> {
    setError(null)
    const dir = await window.chuckle.vault.selectDirectory()
    if (!dir) return
    setBusy(true)
    try {
      const vault = await window.chuckle.vault.create(dir, basename(dir))
      onVaultSelected(vault.path, vault.name)
    } catch (e) {
      setError(`Setup failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  if (vaults === null) {
    return <div className="min-h-screen grid place-items-center text-sm text-fg/40">Loading…</div>
  }

  return (
    <div className="min-h-screen bg-app flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-1">
          <Logo size={38} />
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-fg">Signoff</h1>
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

        <div className="flex gap-2.5">
          <button
            onClick={handleCreateVault}
            disabled={busy}
            className="flex-1 px-4 py-2.5 rounded-lg bg-iris text-white text-[13px] font-semibold hover:bg-iris-ink active:brightness-95 disabled:opacity-50 transition"
          >
            {busy ? 'Setting up…' : 'Set up in a project'}
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
        {error && (
          <p className="mt-3 text-[12.5px] text-stop bg-stop-soft border border-stop/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
