import { defineConfig } from 'vitest/config'

export default defineConfig({
  css: false,
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/vault-bridge.test.ts', 'tests/security.test.ts', 'tests/connect-claude.test.ts', 'tests/tier-bridge.test.ts', 'tests/adr-bridge.test.ts'],
  },
})
