import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

const env = loadEnv('test', resolve('secret'), '')

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@main': resolve('src/main'),
      '@game': resolve('src/game'),
      '@': resolve('src/renderer/src'),
    },
  },
  test: {
    include: [
      'scripts/banc/**/*.mission-banc.ts',
      'src/main/mission/runtime.test.ts',
      'src/main/mission/scheduler.test.ts',
    ],
    environment: 'jsdom',
    setupFiles: ['src/renderer/src/testSetupStores.ts'],
    fileParallelism: false,
    env,
  },
})
