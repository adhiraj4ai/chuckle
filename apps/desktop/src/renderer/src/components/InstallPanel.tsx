import React, { useEffect, useState } from 'react'
import type { InstallStatus, InstallComponents } from '@shared/ipc-types'

interface Props {
  vaultPath: string
  onClose: () => void
}

function label(s: string, version: string | null): string {
  if (s === 'installed') return `Installed (v${version ?? '?'})`
  if (s === 'outdated') return 'Update available'
  return 'Not installed'
}

export function InstallPanel({ vaultPath, onClose }: Props): React.ReactElement {
  const [status, setStatus] = useState<InstallStatus | null>(null)
  const [gate, setGate] = useState(true)
  const [skill, setSkill] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    window.signoff.install
      .status(vaultPath)
      .then((s) => {
        if (alive) setStatus(s)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      alive = false
    }
  }, [vaultPath])

  async function run(fn: (v: string, c: InstallComponents) => Promise<InstallStatus>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      setStatus(await fn(vaultPath, { gate, skill }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!status) {
    return <div className="p-5 text-[13px] text-fg/40">Loading…</div>
  }

  return (
    <div className="flex flex-col gap-4 p-5 bg-surface border border-border rounded-xl">
      <h3 className="text-[13px] font-semibold text-fg/80">Set up Claude Code for this project</h3>

      {!status.nodeAvailable && (
        <p className="text-[12.5px] text-stop bg-stop-soft border border-stop/20 rounded-lg px-3 py-2">
          Node.js is required on your PATH to run the approval gate. Install Node ≥20 and reopen this panel.
        </p>
      )}

      <label className="flex items-center gap-2 text-[13px] text-fg/80">
        <input
          type="checkbox"
          checked={gate}
          disabled={!status.nodeAvailable}
          onChange={(e) => setGate(e.target.checked)}
          aria-label="Approval gate"
        />
        Approval gate (MCP server + gate hook) —{' '}
        <span className="text-fg/50">{label(status.gate, status.installedVersion)}</span>
      </label>

      <label className="flex items-center gap-2 text-[13px] text-fg/80">
        <input
          type="checkbox"
          checked={skill}
          onChange={(e) => setSkill(e.target.checked)}
          aria-label="Workflow skill"
        />
        Workflow skill — <span className="text-fg/50">{label(status.skill, status.installedVersion)}</span>
      </label>

      {error && (
        <p className="text-[12.5px] text-stop bg-stop-soft border border-stop/20 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-2 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-border text-fg/70 text-[13px] font-medium hover:bg-app transition"
        >
          Close
        </button>
        <button
          onClick={() => void run(window.signoff.install.remove)}
          disabled={busy}
          className="px-4 py-2 rounded-lg border border-border text-fg/80 text-[13px] font-medium hover:bg-app transition disabled:opacity-50"
        >
          Uninstall
        </button>
        <button
          onClick={() => void run(window.signoff.install.apply)}
          disabled={busy || (gate && !status.nodeAvailable)}
          className="px-4 py-2 rounded-lg bg-iris text-white text-[13px] font-semibold hover:brightness-95 disabled:opacity-50 transition"
        >
          Install
        </button>
      </div>
    </div>
  )
}
