import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import {
  defineConfig,
  type MainViteConfig,
  type PreloadViteConfig,
  type RendererViteConfig,
} from 'electron-vite'
import type { Plugin } from 'vite'
import { execSync } from 'node:child_process'
import { basename, resolve } from 'node:path'
import { DECODER_MODULES, withoutDecoderUrls } from './src/main/decoderUrls'

const partage = resolve('src/shared')
const principal = resolve('src/main')
const jeu = resolve('src/game')

/**
 * Strips three.js's decoder URLs so the bundler stops emitting files nothing fetches. The why,
 * and what it weighed, are in `decoderUrls.ts`.
 *
 * Refuses rather than passing the source through: the day three.js writes those URLs differently,
 * a silent no-op puts two megabytes back into the artefact without a single test going red.
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

function commitHash(): string {
  // CI hands it over for free; elsewhere ask git, silencing stderr since the catch already
  // handles the failure and `fatal: not a git repository` would only pollute the terminal.
  const fromCi = process.env['GITHUB_SHA']
  if (fromCi) return fromCi.slice(0, 7)

  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    // Built from an archive, or without git: a missing hash is no reason to fail the build.
    return 'dev'
  }
}

/**
 * `command` rather than `app.isPackaged`: the dev run renames the Electron bundle AND its
 * executable to the product's name (see `scripts/dev-app-identity.mjs`), and Electron decides
 * `isPackaged` by comparing that executable's basename to `electron`. Renamed, it reports a
 * packaged app in the middle of development — which sent the window looking for `out/renderer`
 * instead of the dev server, and switched six other behaviours to their production side.
 *
 * `serve` is the `dev` command; `build` and `preview` run as `build`.
 */
function main(command: string): MainViteConfig {
  return {
    // `@game` for the main process too: `@shared/domain/inputMap` re-exports the control-map
    // domain from the MIT runtime, which is where it is written.
    resolve: { alias: { '@shared': partage, '@main': principal, '@game': jeu } },
    define: {
      __COMMIT_HASH__: JSON.stringify(commitHash()),
      __DEV__: JSON.stringify(command === 'serve'),
    },
    build: {
      externalizeDeps: true,
      rollupOptions: {
        // The two threads and the four worker processes are entry points of their own: each is
        // resolved beside the bundled main, so each has to land there as a file of its own.
        input: {
          index: resolve('src/main/index.ts'),
          pickingValidation: resolve('src/main/pickingValidation.ts'),
          catalogWorker: resolve('src/main/project/catalogWorker.ts'),
          memoryWorker: resolve('src/main/memory/memoryWorker.ts'),
          actionIndexWorker: resolve('src/main/actionIndex/actionIndexWorker.ts'),
          peaksWorker: resolve('src/main/media/peaksWorker.ts'),
          bundleWorker: resolve('src/main/bundle/bundleWorker.ts'),
          sttWorker: resolve('src/main/dictation/sttWorker.ts'),
          embedWorker: resolve('src/main/memory/embedWorker.ts'),
        },
        // 🛑 Chunks land BESIDE the entry, never under `chunks/`: eight sites of `src/main`
        // resolve a path from their own file, and one directory deeper sends every one of them
        // too far — measured, the studio died on `out/build/icon.png`. `main-chunks-stay-flat`.
        output: { entryFileNames: '[name].js', chunkFileNames: '[name]-[hash].js' },
      },
    },
  }
}

const preload: PreloadViteConfig = {
  resolve: { alias: { '@shared': partage, '@game': jeu } },
  build: {
    externalizeDeps: true,
    rollupOptions: {
      input: resolve('src/preload/index.ts'),
      // A sandboxed preload MUST be CommonJS: Electron refuses to load an ESM module, and
      // the `window.studio` bridge is then never installed — silently.
      output: { format: 'cjs', entryFileNames: 'index.cjs' },
    },
  },
}

const renderer: RendererViteConfig = {
  root: resolve('src/renderer'),
  plugins: [react(), tailwindcss(), strippedDecoderUrls()],
  worker: { plugins: () => [strippedDecoderUrls()] },
  // `@game` here as well as in `tsconfig.web.json`: a path the compiler resolves and the
  // bundler does not fails at RUNTIME with a green typecheck.
  resolve: {
    alias: { '@': resolve('src/renderer/src'), '@game': jeu, '@shared': partage },
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve('src/renderer/index.html'),
        pickingValidation: resolve('src/renderer/pickingValidation.html'),
        splash: resolve('src/renderer/splash.html'),
      },
    },
  },
}

export default defineConfig(({ command }) => ({ main: main(command), preload, renderer }))
