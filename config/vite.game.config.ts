import { defineConfig } from 'vite'
import { basename, resolve } from 'node:path'
import { cpSync } from 'node:fs'
import type { Plugin } from 'vite'

import { DECODER_MODULES, withoutDecoderUrls } from '../src/main/decoderUrls'
import { withoutNodeModuleImport } from '../src/main/export/withoutNodeModuleImport'

const ROOT = resolve(import.meta.dirname, '..')

/**
 * The runtime an EXPORTED game ships — one ES module, no studio, no React, no Electron.
 *
 * 🛑 Its own config rather than a third entry of `electron.vite.config.ts`: that one builds the
 * studio's window with Tailwind and the React plugin, and a game must carry none of it. What
 * keeps the two apart is `main/export-imports.test.ts`, which sweeps what the entry reaches.
 */
function strippedDecoderUrls(): Plugin {
  return {
    name: 'provider:stripped-decoder-urls',
    transform(source, id) {
      if (!DECODER_MODULES.includes(basename(id))) return null

      const code = withoutDecoderUrls(source)
      if (code === source) {
        throw new Error(`${basename(id)} names no '../libs/' decoder URL — the rewrite is stale`)
      }
      return { code, map: null }
    },
  }
}

function gameDecoders(): Plugin {
  return {
    name: 'game:decoders',
    closeBundle() {
      cpSync(
        resolve(ROOT, 'src/renderer/public/decoders'),
        resolve(ROOT, 'resources/gameRuntime/decoders'),
        {
          recursive: true,
        },
      )
    },
  }
}

function stubNodeBuiltins(): Plugin {
  return {
    name: 'game:stub-node-module',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'node:module' || id === 'module') return '\0game:node-stub'
    },
    load(id) {
      if (id === '\0game:node-stub') return 'export function createRequire() { return () => ({}) }'
    },
    transform(code, id) {
      if (!id.includes('jolt-physics') || !code.includes('node:module')) return null
      return { code: withoutNodeModuleImport(code), map: null }
    },
  }
}

export default defineConfig({
  publicDir: false,
  plugins: [stubNodeBuiltins(), strippedDecoderUrls(), gameDecoders()],
  resolve: {
    alias: {
      '@': resolve(ROOT, 'src/renderer/src'),
      '@game': resolve(ROOT, 'src/game'),
      '@shared': resolve(ROOT, 'src/shared'),
    },
  },
  build: {
    outDir: resolve(ROOT, 'resources/gameRuntime'),
    emptyOutDir: true,
    // A library, not a page: the page an export writes imports `./runtime.js` by name.
    lib: {
      entry: resolve(ROOT, 'src/renderer/src/game/exportEntry.ts'),
      formats: ['es'],
      fileName: () => 'runtime.js',
    },
    rollupOptions: {
      // Rollup treats `node:` as external unless told otherwise, which writes the import back
      // onto `runtime.js` even after the transform above.
      external: (id: string) => (id.startsWith('node:') ? false : undefined),
    },
  },
})
