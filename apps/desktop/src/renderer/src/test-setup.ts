import { vi } from 'vitest'
import '@testing-library/jest-dom'
import type { ChuckleAPI } from '@shared/ipc-types'

const mockChuckle: ChuckleAPI = {
  vault: {
    list: vi.fn(),
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
  },
  features: {
    list: vi.fn(),
  },
  document: {
    read: vi.fn(),
    write: vi.fn(),
    getApproval: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
  },
  workflows: {
    read: vi.fn(),
  },
  openExternal: vi.fn(),
}

Object.defineProperty(window, 'chuckle', {
  value: mockChuckle,
  writable: true,
})
