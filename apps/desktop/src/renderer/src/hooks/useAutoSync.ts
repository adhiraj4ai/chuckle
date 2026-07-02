import { useEffect, useRef } from 'react'

/**
 * While a vault is open and intervalMs > 0, sync on that cadence.
 *
 * When a `runSync` callback is supplied, each tick delegates to it — the caller
 * owns the actual pull/push and its in-flight guard, so an auto-tick is skipped
 * while a manual (or other) sync is already running. When `runSync` is omitted
 * the hook falls back to its own best-effort pull-then-push.
 *
 * Best-effort: failures are swallowed here (surfaced by the status indicator).
 */
export function useAutoSync(
  vaultPath: string | null,
  intervalMs: number,
  runSync?: (() => Promise<boolean>) | (() => void),
  onSynced?: () => void
): void {
  // Keep the latest callbacks in refs so changing them doesn't reset the timer.
  const runSyncRef = useRef(runSync)
  const onSyncedRef = useRef(onSynced)
  runSyncRef.current = runSync
  onSyncedRef.current = onSynced

  useEffect(() => {
    if (!vaultPath || intervalMs <= 0) return
    let cancelled = false
    // Local guard so two overlapping ticks (a slow sync spanning an interval)
    // never run concurrently even without an external runSync.
    let ticking = false

    async function tick(): Promise<void> {
      if (ticking) return
      ticking = true
      try {
        const run = runSyncRef.current
        if (run) {
          await run()
          if (!cancelled) onSyncedRef.current?.()
          return
        }
        try {
          await window.signoff.vault.sync(vaultPath as string)
        } catch {
          /* offline / no upstream — status indicator reflects it */
        }
        try {
          await window.signoff.vault.push(vaultPath as string)
        } catch {
          /* best-effort */
        }
        if (!cancelled) onSyncedRef.current?.()
      } finally {
        ticking = false
      }
    }

    const id = setInterval(tick, intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [vaultPath, intervalMs])
}

export const AUTO_SYNC_OPTIONS: { label: string; ms: number }[] = [
  { label: 'Off', ms: 0 },
  { label: 'Every 1 min', ms: 60_000 },
  { label: 'Every 2 min', ms: 120_000 },
  { label: 'Every 5 min', ms: 300_000 },
  { label: 'Every 30 min', ms: 1_800_000 },
  { label: 'Every 1 hour', ms: 3_600_000 },
  { label: 'Every 4 hours', ms: 14_400_000 },
  { label: 'Every 1 day', ms: 86_400_000 },
]
