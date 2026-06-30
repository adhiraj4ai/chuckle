import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Tracks which features the reviewer has already opened, so freshly-arrived
 * ones can be flagged "New" in the sidebar until opened.
 *
 * The first time a given vault is encountered we seed the seen-set with every
 * feature present at that moment — existing entries must NOT all light up as
 * new. After that baseline, any feature absent from the set (i.e. published or
 * pulled in later) reads as new until {@link markSeen} is called for it. The
 * set is persisted per vault path in localStorage so it survives reloads.
 */
export function useSeenFeatures(
  vaultPath: string | null,
  featureNames: string[]
): { isNew: (name: string) => boolean; markSeen: (name: string) => void } {
  const [seen, setSeen] = useState<Set<string>>(new Set())
  // The vault whose baseline `seen` reflects — guards isNew() from reporting
  // against a stale set during the render before the load effect runs.
  const seededFor = useRef<string | null>(null)
  // Latest feature names, read inside the load effect without making it a dep
  // (the baseline is the snapshot at first open, not every list change).
  const namesRef = useRef(featureNames)
  namesRef.current = featureNames

  useEffect(() => {
    if (!vaultPath) {
      setSeen(new Set())
      seededFor.current = null
      return
    }
    const key = storageKey(vaultPath)
    const raw = window.localStorage.getItem(key)
    if (raw) {
      try {
        setSeen(new Set(JSON.parse(raw) as string[]))
        seededFor.current = vaultPath
        return
      } catch {
        /* corrupt entry → reseed below */
      }
    }
    const baseline = new Set(namesRef.current)
    window.localStorage.setItem(key, JSON.stringify([...baseline]))
    setSeen(baseline)
    seededFor.current = vaultPath
  }, [vaultPath])

  const markSeen = useCallback(
    (name: string) => {
      if (!vaultPath) return
      setSeen((prev) => {
        if (prev.has(name)) return prev
        const next = new Set(prev).add(name)
        window.localStorage.setItem(storageKey(vaultPath), JSON.stringify([...next]))
        return next
      })
    },
    [vaultPath]
  )

  const isNew = useCallback(
    (name: string) => seededFor.current === vaultPath && vaultPath !== null && !seen.has(name),
    [seen, vaultPath]
  )

  return { isNew, markSeen }
}

function storageKey(vaultPath: string): string {
  return `signoff.seen.${vaultPath}`
}
