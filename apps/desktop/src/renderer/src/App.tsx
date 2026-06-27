import React, { useCallback, useEffect, useState } from 'react'
import { VaultSwitcher } from './components/VaultSwitcher'
import { Sidebar } from './components/Sidebar'
import { DocumentPane } from './components/DocumentPane'
import { ReviewPanel } from './components/ReviewPanel'
import { StatusBar } from './components/StatusBar'
import { GitPanel } from './components/GitPanel'
import { useVault } from './hooks/useVault'
import { useAutoSync } from './hooks/useAutoSync'
import type { ApprovalRecord, ApprovalStatus, DocumentType, ReviewResult, WorkflowConfig } from '@shared/ipc-types'

const DOC_TYPES: DocumentType[] = ['spec', 'plan']

type ActionDone = (result?: ReviewResult) => void

function SelectedDocument({
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
  const [reload, setReload] = useState(0)

  useEffect(() => {
    setRecord(undefined)
    Promise.all([
      window.chuckle.document.getApproval(vaultPath, feature, type),
      window.chuckle.workflows.read(vaultPath),
    ])
      .then(([r, w]) => {
        setRecord(r)
        setWorkflow(w?.[type])
      })
      .catch(() => {
        setRecord(null)
        setWorkflow(undefined)
      })
  }, [vaultPath, feature, type, reload])

  // refetch this document's record after an action, then bubble up
  const onDone: ActionDone = (result) => {
    setReload((n) => n + 1)
    onActionComplete(result)
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <DocumentPane
        vaultPath={vaultPath}
        feature={feature}
        type={type}
        docTypes={docTypes}
        onSelectType={onSelectType}
        onApprove={() => onDone()}
        onReject={() => onDone()}
        onSaved={onDone}
      />
      <ReviewPanel
        vaultPath={vaultPath}
        feature={feature}
        type={type}
        record={record}
        workflow={workflow}
        onActionComplete={onDone}
      />
    </div>
  )
}

export function App(): React.ReactElement {
  const { state, openVault, closeVault, selectFeature, selectType, refresh, sync } = useVault()
  const [showGit, setShowGit] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const [syncKey, setSyncKey] = useState(0)
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null)
  const [autoSyncMs, setAutoSyncMs] = useState<number>(
    () => Number(localStorage.getItem('chuckle.autoSyncMs')) || 0
  )
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (localStorage.getItem('chuckle.theme') === 'dark' ? 'dark' : 'light')
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('chuckle.theme', theme)
  }, [theme])

  const vaultPath = state?.vaultPath ?? null
  const bump = useCallback(() => setSyncKey((k) => k + 1), [])

  const onAutoSynced = useCallback(() => {
    setLastSyncedAt(Date.now())
    bump()
  }, [bump])
  useAutoSync(vaultPath, autoSyncMs, onAutoSynced)

  const syncNow = useCallback(async () => {
    if (!vaultPath) return
    setSyncing(true)
    try {
      await window.chuckle.vault.sync(vaultPath)
    } catch {
      /* surfaced by indicator */
    }
    try {
      await window.chuckle.vault.push(vaultPath)
    } catch {
      /* best-effort */
    }
    setLastSyncedAt(Date.now())
    setSyncing(false)
    bump()
  }, [vaultPath, bump])

  const setAutoSync = useCallback((ms: number) => {
    setAutoSyncMs(ms)
    localStorage.setItem('chuckle.autoSyncMs', String(ms))
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
          onSelect={selectFeature}
          onSync={sync}
          onSwitchVault={closeVault}
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
            <SelectedDocument
              key={active.feature}
              vaultPath={state.vaultPath}
              feature={active.feature}
              type={active.type}
              docTypes={activeTypes}
              onSelectType={selectType}
              onActionComplete={onActionComplete}
            />
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
          {!toast.ok && (
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
    </div>
  )
}
