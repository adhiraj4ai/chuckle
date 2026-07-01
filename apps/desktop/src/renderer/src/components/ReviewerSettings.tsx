import React, { useEffect, useState } from 'react'
import type { VaultWorkflows } from '@shared/ipc-types'

type Mode = 'unanimous' | 'threshold'

interface Props {
  vaultPath: string
  onClose: () => void
}

export function ReviewerSettings({ vaultPath, onClose }: Props): React.ReactElement {
  const [workflows, setWorkflows] = useState<VaultWorkflows | null>(null)
  const [specApprovers, setSpecApprovers] = useState('')
  const [specMin, setSpecMin] = useState(1)
  const [specMode, setSpecMode] = useState<Mode>('unanimous')
  const [planApprovers, setPlanApprovers] = useState('')
  const [planMin, setPlanMin] = useState(1)
  const [planMode, setPlanMode] = useState<Mode>('unanimous')
  const [adrApprovers, setAdrApprovers] = useState('')
  const [adrMin, setAdrMin] = useState(1)
  const [adrMode, setAdrMode] = useState<Mode>('unanimous')
  const [specRequireDiagram, setSpecRequireDiagram] = useState(false)
  const [planRequireDiagram, setPlanRequireDiagram] = useState(false)
  const [adrRequireDiagram, setAdrRequireDiagram] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Coerce any user/stored value to a valid minimum (>= 1).
  const clampMin = (v: number | string): number => Math.max(1, Number(v) || 1)

  useEffect(() => {
    let alive = true
    window.signoff.workflows
      .read(vaultPath)
      .then((w) => {
        if (!alive) return
        setWorkflows(w)
        setSpecApprovers(w.spec.required_approvers.join(', '))
        setSpecMin(clampMin(w.spec.min_approvals))
        setSpecMode(w.spec.approval_mode === 'threshold' ? 'threshold' : 'unanimous')
        setSpecRequireDiagram(w.spec.require_diagram === true)
        setPlanApprovers(w.plan.required_approvers.join(', '))
        setPlanMin(clampMin(w.plan.min_approvals))
        setPlanMode(w.plan.approval_mode === 'threshold' ? 'threshold' : 'unanimous')
        setPlanRequireDiagram(w.plan.require_diagram === true)
        setAdrApprovers(w.adr.required_approvers.join(', '))
        setAdrMin(clampMin(w.adr.min_approvals))
        setAdrMode(w.adr.approval_mode === 'threshold' ? 'threshold' : 'unanimous')
        setAdrRequireDiagram(w.adr.require_diagram === true)
      })
      .catch((e) => {
        // Escape the "Loading…" state: fall back to defaults + show an error.
        if (!alive) return
        setWorkflows({
          spec: { required_approvers: [], min_approvals: 1 },
          plan: { required_approvers: [], min_approvals: 1 },
          adr: { required_approvers: [], min_approvals: 1 },
        })
        setSpecMode('unanimous')
        setPlanMode('unanimous')
        setAdrMode('unanimous')
        setSpecRequireDiagram(false)
        setPlanRequireDiagram(false)
        setAdrRequireDiagram(false)
        setError(`Couldn't load reviewer settings: ${e instanceof Error ? e.message : String(e)}`)
      })
    return () => { alive = false }
  }, [vaultPath])

  async function handleSave(): Promise<void> {
    if (!workflows) return
    setSaving(true)
    setError(null)
    const parseEmails = (csv: string): string[] =>
      csv.split(',').map((s) => s.trim()).filter(Boolean)
    const next: VaultWorkflows = {
      spec: { ...workflows.spec, required_approvers: parseEmails(specApprovers), min_approvals: clampMin(specMin), approval_mode: specMode, require_diagram: specRequireDiagram },
      plan: { ...workflows.plan, required_approvers: parseEmails(planApprovers), min_approvals: clampMin(planMin), approval_mode: planMode, require_diagram: planRequireDiagram },
      adr: { ...workflows.adr, required_approvers: parseEmails(adrApprovers), min_approvals: clampMin(adrMin), approval_mode: adrMode, require_diagram: adrRequireDiagram },
    }
    try {
      await window.signoff.workflows.write(vaultPath, next)
      onClose()
    } catch (e) {
      setError(`Couldn't save reviewer settings: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  if (!workflows) {
    return (
      <div className="p-5 text-[13px] text-fg/40">Loading…</div>
    )
  }

  return (
    <div className="flex flex-col gap-5 p-5 bg-surface border border-border rounded-xl">
      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold text-fg/45 tracking-wider">Spec</h3>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-fg/60">Spec approvers</span>
          <input
            type="text"
            aria-label="Spec approvers"
            value={specApprovers}
            onChange={(e) => setSpecApprovers(e.target.value)}
            placeholder="email1@org.com, email2@org.com"
            className="rounded-lg border border-border bg-app px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-iris/30 focus:border-iris/50 placeholder:text-fg/30"
          />
          <span className="text-[11px] text-fg/40">Comma-separated emails. Empty = anyone can approve.</span>
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-[12px] text-fg/60">Approval rule</legend>
          <label className="flex items-center gap-2 text-[13px] text-fg/80">
            <input type="radio" name="spec-mode" checked={specMode === 'unanimous'} onChange={() => setSpecMode('unanimous')} />
            All listed approvers
          </label>
          <label className="flex items-center gap-2 text-[13px] text-fg/80">
            <input type="radio" name="spec-mode" checked={specMode === 'threshold'} onChange={() => setSpecMode('threshold')} />
            At least N
          </label>
          {specMode === 'threshold' && (
            <label className="flex flex-col gap-1 mt-1">
              <span className="text-[12px] text-fg/60">Minimum approvals</span>
              <input
                type="number"
                min={1}
                aria-label="Minimum approvals"
                value={specMin}
                onChange={(e) => setSpecMin(clampMin(e.target.value))}
                className="w-20 rounded-lg border border-border bg-app px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-iris/30"
              />
            </label>
          )}
        </fieldset>
        <label className="flex items-center gap-2 text-[13px] text-fg/80">
          <input type="checkbox" checked={specRequireDiagram} onChange={(e) => setSpecRequireDiagram(e.target.checked)} aria-label="Spec require a diagram" />
          Require a diagram
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold text-fg/45 tracking-wider">Plan</h3>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-fg/60">Plan approvers</span>
          <input
            type="text"
            aria-label="Plan approvers"
            value={planApprovers}
            onChange={(e) => setPlanApprovers(e.target.value)}
            placeholder="email1@org.com, email2@org.com"
            className="rounded-lg border border-border bg-app px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-iris/30 focus:border-iris/50 placeholder:text-fg/30"
          />
          <span className="text-[11px] text-fg/40">Comma-separated emails. Empty = anyone can approve.</span>
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-[12px] text-fg/60">Approval rule</legend>
          <label className="flex items-center gap-2 text-[13px] text-fg/80">
            <input type="radio" name="plan-mode" checked={planMode === 'unanimous'} onChange={() => setPlanMode('unanimous')} />
            All listed approvers
          </label>
          <label className="flex items-center gap-2 text-[13px] text-fg/80">
            <input type="radio" name="plan-mode" checked={planMode === 'threshold'} onChange={() => setPlanMode('threshold')} />
            At least N
          </label>
          {planMode === 'threshold' && (
            <label className="flex flex-col gap-1 mt-1">
              <span className="text-[12px] text-fg/60">Minimum approvals</span>
              <input
                type="number"
                min={1}
                aria-label="Minimum approvals"
                value={planMin}
                onChange={(e) => setPlanMin(clampMin(e.target.value))}
                className="w-20 rounded-lg border border-border bg-app px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-iris/30"
              />
            </label>
          )}
        </fieldset>
        <label className="flex items-center gap-2 text-[13px] text-fg/80">
          <input type="checkbox" checked={planRequireDiagram} onChange={(e) => setPlanRequireDiagram(e.target.checked)} aria-label="Plan require a diagram" />
          Require a diagram
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold text-fg/45 tracking-wider">ADR</h3>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-fg/60">ADR approvers</span>
          <input
            type="text"
            aria-label="ADR approvers"
            value={adrApprovers}
            onChange={(e) => setAdrApprovers(e.target.value)}
            placeholder="email1@org.com, email2@org.com"
            className="rounded-lg border border-border bg-app px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-iris/30 focus:border-iris/50 placeholder:text-fg/30"
          />
          <span className="text-[11px] text-fg/40">Comma-separated emails. Empty = anyone can approve.</span>
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-[12px] text-fg/60">Approval rule</legend>
          <label className="flex items-center gap-2 text-[13px] text-fg/80">
            <input type="radio" name="adr-mode" checked={adrMode === 'unanimous'} onChange={() => setAdrMode('unanimous')} />
            All listed approvers
          </label>
          <label className="flex items-center gap-2 text-[13px] text-fg/80">
            <input type="radio" name="adr-mode" checked={adrMode === 'threshold'} onChange={() => setAdrMode('threshold')} />
            At least N
          </label>
          {adrMode === 'threshold' && (
            <label className="flex flex-col gap-1 mt-1">
              <span className="text-[12px] text-fg/60">Minimum approvals</span>
              <input
                type="number"
                min={1}
                aria-label="Minimum approvals"
                value={adrMin}
                onChange={(e) => setAdrMin(clampMin(e.target.value))}
                className="w-20 rounded-lg border border-border bg-app px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-iris/30"
              />
            </label>
          )}
        </fieldset>
        <label className="flex items-center gap-2 text-[13px] text-fg/80">
          <input type="checkbox" checked={adrRequireDiagram} onChange={(e) => setAdrRequireDiagram(e.target.checked)} aria-label="ADR require a diagram" />
          Require a diagram
        </label>
      </section>

      {error && (
        <p className="text-[12.5px] text-stop bg-stop-soft border border-stop/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-2 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-border text-fg/70 text-[13px] font-medium hover:bg-app transition"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-iris text-white text-[13px] font-semibold hover:brightness-95 disabled:opacity-50 transition"
        >
          Save
        </button>
      </div>
    </div>
  )
}
