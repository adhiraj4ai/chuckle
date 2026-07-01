import React, { useCallback, useEffect, useRef, useState } from 'react'
import { VaultSwitcher } from './components/VaultSwitcher'
import { Sidebar } from './components/Sidebar'
import { DocumentPane } from './components/DocumentPane'
import { ReviewPanel } from './components/ReviewPanel'
import { DiscussionRail } from './components/DiscussionRail.js'
import { StatusBar } from './components/StatusBar'
import { GitPanel } from './components/GitPanel'
import { FeatureMetaBar } from './components/FeatureMetaBar'
import { CategoryManager } from './components/CategoryManager'
import { useVault } from './hooks/useVault'
import { useAutoSync } from './hooks/useAutoSync'
import { useSeenFeatures } from './hooks/useSeenFeatures'
import type { ApprovalRecord, ApprovalStatus, DocumentType, ReviewResult, WorkflowConfig } from '@shared/ipc-types'

const DOC_TYPES: DocumentType[] = ['spec', 'plan', 'adr']

type ActionDone = (result?: ReviewResult) => void

export function SelectedDocument({
  vaultPath,
  feature,
  type,
  docTypes,
  onSelectType,
  onActionComplete,
}: {
  vaultPath: string
  feature: string
  type: DocumentType
  docTypes: { type: DocumentType; status: ApprovalStatus | 'not_found' }[]
  onSelectType: (type: DocumentType) => void
  onActionComplete: ActionDone
}): React.ReactElement {
  const [record, setRecord] = useState<ApprovalRecord | null | undefined>(undefined)
  const [workflow, setWorkflow] = useState<WorkflowConfig | undefined>(undefined)
  const [missingDiagram, setMissingDiagram] = useState(false)
  const [reload, setReload] = useState(0)
  const [showDiscussion, setShowDiscussion] = useState(false)
  const [markdown, setMarkdown] = useState('')

  useEffect(() => {
    // `alive` guards against a stale/late response overwriting newer state (or
    // setState after unmount) when vaultPath/feature/type change rapidly.
    let alive = true
    setRecord(undefined)
    Promise.all([
      window.signoff.document.getApproval(vaultPath, feature, type),
      window.signoff.workflows.read(vaultPath),
      window.signoff.document.getStatus(vaultPath, feature, type),
    ])
      .then(([r, w, statusRes]) => {
        if (!alive) return
        setRecord(r)
        setWorkflow(w?.[type])
        setMissingDiagram(statusRes?.missing_diagram === true)
      })
      .catch(() => {
        if (!alive) return
        setRecord(null)
        setWorkflow(undefined)
        setMissingDiagram(false)
      })
    return () => { alive = false }
  }, [vaultPath, feature, type, reload])

  useEffect(() => {
    let alive = true
    setMarkdown('')
    window.signoff.document
      .read(vaultPath, feature, type)
      .then((m) => { if (alive) setMarkdown(m) })
      .catch(() => { if (alive) setMarkdown('') })
    return () => { alive = false }
  }, [vaultPath, feature, type])

  // refetch this document's record after an action, then bubble up
  const onDone: ActionDone = (result) => {
    setReload((n) => n + 1)
    onActionComplete(result)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Discussion toggle bar */}
      <div className="flex items-center justify-end px-4 py-1.5 bg-surface border-b border-border gap-2">
        <button
          onClick={() => setShowDiscussion((v) => !v)}
          aria-pressed={showDiscussion}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition ${
            showDiscussion ? 'bg-iris/10 text-iris' : 'text-fg/45 hover:text-fg/80 hover:bg-app/60'
          }`}
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M2 3.5C2 3 2.4 2.5 3 2.5h10c.6 0 1 .5 1 1v7c0 .5-.4 1-1 1H5l-3 2V3.5z" strokeLinejoin="round" />
          </svg>
          Discussion
        </button>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <DocumentPane
          vaultPath={vaultPath}
          feature={feature}
          type={type}
          docTypes={docTypes}
          onSelectType={onSelectType}
          onSaved={onDone}
        />
        {showDiscussion ? (
          <aside className="w-80 min-w-80 border-l border-border bg-surface flex flex-col h-full overflow-hidden">
            <DiscussionRail
              vaultPath={vaultPath}
              feature={feature}
              type={type}
              markdown={markdown}
            />
          </aside>
        ) : (
          <ReviewPanel
            vaultPath={vaultPath}
            feature={feature}
            type={type}
            record={record}
            derivedStatus={docTypes.find((d) => d.type === type)?.status ?? 'not_found'}
            workflow={workflow}
            missingDiagram={missingDiagram}
            onActionComplete={onDone}
          />
        )}
      </div>
    </div>
  )
}

export function App(): React.ReactElement {
  const { state, openVault, closeVault, selectFeature, selectType, refresh } = useVault()
  const [showGit, setShowGit] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const [syncKey, setSyncKey] = useState(0)
  const [toast, setToast] = useState<{ text: string; ok: boolean; conflict?: boolean } | null>(null)
  const [autoSyncMs, setAutoSyncMs] = useState<number>(
    () => Number(localStorage.getItem('signoff.autoSyncMs')) || 0
  )
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (localStorage.getItem('signoff.theme') === 'dark' ? 'dark' : 'light')
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('signoff.theme', theme)
  }, [theme])

  const vaultPath = state?.vaultPath ?? null
  const bump = useCallback(() => setSyncKey((k) => k + 1), [])

  // "New until opened" tracking for sidebar features.
  const { isNew, markSeen } = useSeenFeatures(vaultPath, state?.features.map((f) => f.name) ?? [])
  const onSelectFeature = useCallback(
    (feature: string) => {
      markSeen(feature)
      selectFeature(feature)
    },
    [markSeen, selectFeature]
  )

  // Single in-flight guard: syncNow, the auto-sync tick, and any other sync
  // trigger all funnel through this. Only one pull+push runs at a time; a
  // concurrent request is skipped (returns false) rather than racing.
  const syncInFlight = useRef(false)
  const runSync = useCallback(async (): Promise<boolean> => {
    if (!vaultPath || syncInFlight.current) return false
    syncInFlight.current = true
    setSyncing(true)
    try {
      try {
        await window.signoff.vault.sync(vaultPath)
      } catch {
        /* surfaced by indicator */
      }
      try {
        await window.signoff.vault.push(vaultPath)
      } catch {
        /* best-effort */
      }
      // Re-list features regardless of pull/push outcome: a new spec may already
      // be in the local manifest (published by the MCP server) even when the
      // remote pull fails, and the in-memory list would otherwise stay stale.
      try {
        await refresh()
      } catch {
        /* keep the last-known list rather than throwing */
      }
      setLastSyncedAt(Date.now())
      bump()
      return true
    } finally {
      setSyncing(false)
      syncInFlight.current = false
    }
  }, [vaultPath, bump, refresh])

  // Auto-sync ticks go through runSync so they skip while a manual/other sync
  // is already running; runSync itself updates lastSyncedAt + bumps.
  useAutoSync(vaultPath, autoSyncMs, runSync)

  const syncNow = useCallback(async () => {
    await runSync()
  }, [runSync])

  const setAutoSync = useCallback((ms: number) => {
    setAutoSyncMs(ms)
    localStorage.setItem('signoff.autoSyncMs', String(ms))
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(id)
  }, [toast])

  const onActionComplete = useCallback<ActionDone>(
    (result) => {
      refresh()
      bump()
      if (result) {
        if (result.pushed) {
          setLastSyncedAt(Date.now())
          setToast({ text: 'Synced to GitHub', ok: true })
        } else if (result.conflict === true) {
          setToast({ text: "A teammate's changes overlap yours — Resync and redo your action.", ok: false, conflict: true })
        } else {
          setToast({ text: 'Saved — not synced yet', ok: false })
        }
      }
    },
    [refresh, bump]
  )

  if (!state) {
    return <VaultSwitcher onVaultSelected={openVault} />
  }

  const active = state.active
  const activeEntry = active ? state.features.find((f) => f.name === active.feature) : undefined
  const activeTypes = activeEntry
    ? DOC_TYPES.filter((t) => activeEntry[t] !== 'not_found').map((t) => ({ type: t, status: activeEntry[t] }))
    : []

  return (
    <div className="relative flex flex-col h-screen overflow-hidden bg-app text-fg">
      <div className="flex flex-1 min-h-0">
        <Sidebar
          vaultName={state.vaultName}
          features={state.features}
          selected={active}
          onSelect={onSelectFeature}
          onSync={syncNow}
          onSwitchVault={closeVault}
          isNew={isNew}
          onManageCategories={() => setManagerOpen(true)}
        />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {!active ? (
            <div className="flex-1 grid place-items-center px-8">
              <div className="text-center max-w-sm">
                <div className="mx-auto w-11 h-11 grid place-items-center rounded-xl bg-surface border border-border shadow-panel text-xl">
                  📄
                </div>
                <h2 className="mt-4 text-[15px] font-semibold text-fg">Pick a feature to review</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-fg/50">
                  Choose a feature from the sidebar to open its spec and plan, then approve or request changes.
                </p>
              </div>
            </div>
          ) : (
            <>
              {activeEntry && (
                <FeatureMetaBar vaultPath={state.vaultPath} feature={activeEntry} onChanged={refresh} />
              )}
              <SelectedDocument
                key={`${active.feature}:${active.type}`}
                vaultPath={state.vaultPath}
                feature={active.feature}
                type={active.type}
                docTypes={activeTypes}
                onSelectType={selectType}
                onActionComplete={onActionComplete}
              />
            </>
          )}
        </div>
      </div>

      {toast && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 bottom-9 z-40 flex items-center gap-2 px-3.5 py-2 rounded-lg shadow-panel text-[12.5px] ${
            toast.ok ? 'bg-ok text-white' : 'bg-ink text-white'
          }`}
        >
          <span>{toast.text}</span>
          {toast.conflict && (
            <button
              onClick={async () => {
                setToast(null)
                await window.signoff.vault.sync(state.vaultPath)
                refresh()
                bump()
              }}
              className="underline underline-offset-2 font-medium"
            >
              Resync
            </button>
          )}
          {!toast.ok && !toast.conflict && (
            <button onClick={() => setShowGit(true)} className="underline underline-offset-2 font-medium">
              Open source control
            </button>
          )}
        </div>
      )}

      <StatusBar
        vaultPath={state.vaultPath}
        vaultName={state.vaultName}
        syncKey={syncKey}
        lastSyncedAt={lastSyncedAt}
        syncing={syncing}
        autoSyncMs={autoSyncMs}
        onSetAutoSync={setAutoSync}
        onSyncNow={syncNow}
        onOpenSourceControl={() => setShowGit(true)}
        onSwitchVault={closeVault}
        theme={theme}
        onSetTheme={setTheme}
      />
      {showGit && <GitPanel vaultPath={state.vaultPath} onClose={() => setShowGit(false)} />}
      <CategoryManager
        vaultPath={state.vaultPath}
        features={state.features}
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        onChanged={refresh}
      />
    </div>
  )
}
