import { defineConfig } from 'vitest/config'

export default defineConfig({
  css: false,
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/vault-bridge.test.ts', 'tests/security.test.ts', 'tests/connect-claude.test.ts', 'tests/tier-bridge.test.ts', 'tests/adr-bridge.test.ts', 'tests/ticket-bridge.test.ts', 'tests/bundle-tools.test.ts', 'tests/installer-merge.test.ts', 'tests/installer.test.ts', 'tests/installer-ipc.test.ts', 'tests/commit-audit-log.test.ts', 'tests/read-audit-log.test.ts'],
  },
})
