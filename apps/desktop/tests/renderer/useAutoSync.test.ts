import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAutoSync } from '@renderer/hooks/useAutoSync'

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  vi.mocked(window.chuckle.vault.sync).mockResolvedValue(undefined)
  vi.mocked(window.chuckle.vault.push).mockResolvedValue({ ok: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useAutoSync', () => {
  it('does nothing when the interval is Off (0)', () => {
    renderHook(() => useAutoSync('/v', 0))
    vi.advanceTimersByTime(120_000)
    expect(window.chuckle.vault.sync).not.toHaveBeenCalled()
  })

  it('does nothing when no vault is open', () => {
    renderHook(() => useAutoSync(null, 60_000))
    vi.advanceTimersByTime(120_000)
    expect(window.chuckle.vault.sync).not.toHaveBeenCalled()
  })

  it('pulls then pushes once per interval', async () => {
    renderHook(() => useAutoSync('/v', 60_000))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(window.chuckle.vault.sync).toHaveBeenCalledTimes(1)
    expect(window.chuckle.vault.push).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(window.chuckle.vault.sync).toHaveBeenCalledTimes(2)
  })

  it('stops the timer on unmount', async () => {
    const { unmount } = renderHook(() => useAutoSync('/v', 60_000))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(window.chuckle.vault.sync).toHaveBeenCalledTimes(1)
    unmount()
    await vi.advanceTimersByTimeAsync(180_000)
    expect(window.chuckle.vault.sync).toHaveBeenCalledTimes(1)
  })
})
