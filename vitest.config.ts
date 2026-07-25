import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Las pruebas nunca salen a la red: las integraciones se prueban con fixtures.
    setupFiles: ['./vitest.setup.ts'],
  },
})
