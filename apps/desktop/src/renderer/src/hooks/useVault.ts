import { useState, useCallback, useRef } from 'react'
import type { FeatureEntry, DocumentType } from '@shared/ipc-types'

export interface Selection {
  feature: string
  type: DocumentType
}

interface VaultState {
  vaultPath: string
  vaultName: string
  features: FeatureEntry[]
  /** The one feature + document type currently open (only one feature at a time). */
  active: Selection | null
}

export interface UseVaultReturn {
  state: VaultState | null
  openVault: (path: string, name: string) => Promise<void>
  closeVault: () => void
  selectFeature: (feature: string) => void
  selectType: (type: DocumentType) => void
  refresh: () => Promise<void>
}

/** Prefer the spec when it exists, otherwise the plan. */
function defaultType(f: FeatureEntry): DocumentType {
  return f.spec !== 'not_found' ? 'spec' : 'plan'
}

export function useVault(): UseVaultReturn {
  const [state, setState] = useState<VaultState | null>(null)
  const vaultPathRef = useRef<string | null>(null)

  const openVault = useCallback(async (path: string, name: string) => {
    const features = await window.signoff.features.list(path)
    vaultPathRef.current = path
    setState({ vaultPath: path, vaultName: name, features, active: null })
  }, [])

  const closeVault = useCallback(() => {
    vaultPathRef.current = null
    setState(null)
  }, [])

  const selectFeature = useCallback((feature: string) => {
    setState((prev) => {
      if (!prev) return prev
      const entry = prev.features.find((f) => f.name === feature)
      if (!entry) return prev
      return { ...prev, active: { feature, type: defaultType(entry) } }
    })
  }, [])

  const selectType = useCallback((type: DocumentType) => {
    setState((prev) => (prev && prev.active ? { ...prev, active: { ...prev.active, type } } : prev))
  }, [])

  const refresh = useCallback(async () => {
    if (!vaultPathRef.current) return
    const features = await window.signoff.features.list(vaultPathRef.current)
    setState((prev) => (prev ? { ...prev, features } : prev))
  }, [])

  return { state, openVault, closeVault, selectFeature, selectType, refresh }
}
