import { useEffect } from 'react'

/**
 * While a vault is open and intervalMs > 0, pull then push on that cadence.
 * Best-effort: failures are swallowed here (surfaced by the status indicator).
 */
export function useAutoSync(
  vaultPath: string | null,
  intervalMs: number,
  onSynced?: () => void
): void {
  useEffect(() => {
    if (!vaultPath || intervalMs <= 0) return
    let cancelled = false

    async function tick(): Promise<void> {
      try {
        await window.chuckle.vault.sync(vaultPath as string)
      } catch {
        /* offline / no upstream — status indicator reflects it */
      }
      try {
        await window.chuckle.vault.push(vaultPath as string)
      } catch {
        /* best-effort */
      }
      if (!cancelled) onSynced?.()
    }

    const id = setInterval(tick, intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [vaultPath, intervalMs, onSynced])
}

export const AUTO_SYNC_OPTIONS: { label: string; ms: number }[] = [
  { label: 'Off', ms: 0 },
  { label: 'Every 1 min', ms: 60_000 },
  { label: 'Every 5 min', ms: 300_000 },
  { label: 'Every 30 min', ms: 1_800_000 },
  { label: 'Every 1 hour', ms: 3_600_000 },
  { label: 'Every 4 hours', ms: 14_400_000 },
  { label: 'Every 1 day', ms: 86_400_000 },
]
