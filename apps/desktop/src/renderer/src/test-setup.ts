import { vi } from 'vitest'
import '@testing-library/jest-dom'
import type { ChuckleAPI } from '@shared/ipc-types'

const mockChuckle: ChuckleAPI = {
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
  },
  features: {
    list: vi.fn(),
  },
  document: {
    read: vi.fn(),
    write: vi.fn(),
    getApproval: vi.fn(),
    isStale: vi.fn(),
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

Object.defineProperty(window, 'chuckle', {
  value: mockChuckle,
  writable: true,
})
