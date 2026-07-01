import { vi } from 'vitest'
import '@testing-library/jest-dom'
import type { SignoffAPI } from '@shared/ipc-types'

// jsdom in this setup ships no localStorage; the app reads it during render
// (theme, auto-sync interval, seen-features). Provide a minimal in-memory shim.
if (typeof window.localStorage === 'undefined') {
  const store = new Map<string, string>()
  const localStorageShim: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => void store.delete(k),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
  }
  Object.defineProperty(window, 'localStorage', { value: localStorageShim, writable: true })
}

const mockSignoff: SignoffAPI = {
  vault: {
    list: vi.fn(),
    remove: vi.fn(),
    create: vi.fn(),
    openExisting: vi.fn(),
    selectDirectory: vi.fn(),
    sync: vi.fn(),
    getRemote: vi.fn(),
    log: vi.fn(),
    status: vi.fn(),
    push: vi.fn(),
    publishBranch: vi.fn(),
    author: vi.fn(),
    onSetupProgress: vi.fn().mockReturnValue(() => {}),
    connectRemote: vi.fn(),
    clone: vi.fn(),
    syncState: vi.fn().mockResolvedValue({ branch: 'main', hasRemote: false, hasUpstream: false, ahead: 0, behind: 0 }),
    connectClaude: vi.fn().mockResolvedValue({ settingsPath: '/p/.claude/settings.json' }),
  },
  features: {
    list: vi.fn(),
    setCategory: vi.fn(),
    setTags: vi.fn(),
    setTier: vi.fn(),
  },
  categories: {
    list: vi.fn().mockResolvedValue([]),
    upsert: vi.fn(),
    remove: vi.fn(),
  },
  document: {
    read: vi.fn(),
    write: vi.fn(),
    getApproval: vi.fn(),
    isStale: vi.fn(),
    getStatus: vi.fn(),
  },
  review: {
    action: vi.fn(),
  },
  comments: {
    read: vi.fn(),
    addThread: vi.fn(),
    addReply: vi.fn(),
    setResolved: vi.fn(),
  },
  project: {
    readClaudeMd: vi.fn(),
  },
  workflows: {
    read: vi.fn(),
    write: vi.fn(),
  },
  openExternal: vi.fn(),
}

Object.defineProperty(window, 'signoff', {
  value: mockSignoff,
  writable: true,
})
