import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

/** This config no longer sits at the root: every path below is anchored, never left to the cwd. */
const ROOT = resolve(import.meta.dirname, '..')

/**
 * The bench, which is not the suite: it spends money, needs a key and answers differently twice
 * in a row — hence a config of its own and a suffix `pnpm test` never picks up.
 */

/** From `secret/.env`, which git does not carry. `''` as the prefix: these are read in Node. */
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
    include: ['scripts/banc/**/*.banc.ts'],
    // jsdom and the store setup, like the `scripts` project of the suite: the bench drives the
    // REAL renderer handlers, and the stores they read are written for a window.
    environment: 'jsdom',
    setupFiles: ['src/renderer/src/testSetupStores.ts'],
    // One at a time: the figures are what the bench is for, and a queue at the door skews them.
    fileParallelism: false,
    env,
  },
})
