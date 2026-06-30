import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSeenFeatures } from '@renderer/hooks/useSeenFeatures'

beforeEach(() => {
  window.localStorage.clear()
})

describe('useSeenFeatures', () => {
  it('does not flag features that already existed when the vault was first opened', () => {
    const { result } = renderHook(() => useSeenFeatures('/vault', ['user-auth', 'payments']))
    expect(result.current.isNew('user-auth')).toBe(false)
    expect(result.current.isNew('payments')).toBe(false)
  })

  it('flags a feature that arrives after the baseline as new', () => {
    const { result, rerender } = renderHook(
      ({ names }) => useSeenFeatures('/vault', names),
      { initialProps: { names: ['user-auth'] } }
    )
    rerender({ names: ['user-auth', 'audit-log'] })
    expect(result.current.isNew('audit-log')).toBe(true)
    expect(result.current.isNew('user-auth')).toBe(false)
  })

  it('clears the new flag once a feature is marked seen, and persists it', () => {
    const { result, rerender } = renderHook(
      ({ names }) => useSeenFeatures('/vault', names),
      { initialProps: { names: ['user-auth'] } }
    )
    rerender({ names: ['user-auth', 'audit-log'] })
    expect(result.current.isNew('audit-log')).toBe(true)

    act(() => result.current.markSeen('audit-log'))
    expect(result.current.isNew('audit-log')).toBe(false)

    // a fresh mount for the same vault remembers it was seen
    const second = renderHook(() => useSeenFeatures('/vault', ['user-auth', 'audit-log']))
    expect(second.result.current.isNew('audit-log')).toBe(false)
  })

  it('tracks seen-state per vault path independently', () => {
    renderHook(() => useSeenFeatures('/vault-a', ['shared']))
    const { result } = renderHook(() => useSeenFeatures('/vault-b', []))
    // 'shared' was the baseline for vault-a, but is brand new to vault-b
    const { result: r2, rerender } = renderHook(
      ({ names }) => useSeenFeatures('/vault-b', names),
      { initialProps: { names: [] as string[] } }
    )
    rerender({ names: ['shared'] })
    expect(r2.current.isNew('shared')).toBe(true)
    expect(result.current.isNew('shared')).toBe(true)
  })

  it('flags nothing when there is no open vault', () => {
    const { result } = renderHook(() => useSeenFeatures(null, ['user-auth']))
    expect(result.current.isNew('user-auth')).toBe(false)
  })
})
