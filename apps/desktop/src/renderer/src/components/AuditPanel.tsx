import React, { useEffect, useState } from 'react'
import type { AuditLogEntry } from '@shared/ipc-types'

interface Props {
  vaultPath: string
  feature: string
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString()
}

/**
 * Read-only view of the session audit log for the selected feature: who did
 * what, when, and whether it was allowed or blocked. No writes/mutations —
 * this panel only calls `window.signoff.audit.read`.
 */
export function AuditPanel({ vaultPath, feature }: Props): React.ReactElement {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    setLoaded(false)
    window.signoff.audit
      .read(vaultPath, feature)
      .then((rows) => {
        if (alive) {
          setEntries(rows)
          setLoaded(true)
        }
      })
      .catch(() => {
        if (alive) {
          setEntries([])
          setLoaded(true)
        }
      })
    return () => {
      alive = false
    }
  }, [vaultPath, feature])

  if (loaded && entries.length === 0) {
    return <div className="audit-empty">No audit activity recorded for this feature yet.</div>
  }

  return (
    <ul className="audit-list">
      {entries.map((e, i) => (
        <li key={`${e.ts}-${i}`} className="audit-row">
          <span className="audit-time">{fmtTime(e.ts)}</span>
          <span className="audit-actor">{e.actor}</span>
          <span className="audit-tool">{e.tool}</span>
          <span className={`audit-badge audit-${e.decision}`}>{e.decision}</span>
        </li>
      ))}
    </ul>
  )
}
