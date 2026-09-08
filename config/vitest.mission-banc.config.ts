import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

/** `include` and `setupFiles` resolve against `root`, which defaults to the cwd, not this folder. */
const ROOT = resolve(import.meta.dirname, '..')

const env = loadEnv('test', resolve(ROOT, 'secret'), '')

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(ROOT, 'src/shared'),
      '@main': resolve(ROOT, 'src/main'),
      '@game': resolve(ROOT, 'src/game'),
      '@': resolve(ROOT, 'src/renderer/src'),
    },
  },
  root: ROOT,
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
