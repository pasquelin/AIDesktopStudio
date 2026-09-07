/**
 * The npm packages that reach a user's disk: bundled by Vite, loaded at runtime, or shipped
 * beside. Not here on purpose: eslint, prettier, vitest, electron-builder and the `@types` — a
 * build tool never leaves the machine that ran it. `typescript` is the exception, see below.
 *
 * Spelled out rather than derived from `dependencies`: this project bundles React, zustand,
 * dockview and the rest with Vite, so they sit in `devDependencies` while shipping in the binary
 * all the same. Deriving from the manifest would quietly omit most of the notice.
 *
 * Under `src/main` rather than `src/shared`: it describes what the repository root ships, and
 * `src/shared` compiles for the renderer, which has no use for the list. Nothing
 * of the application imports it — `scripts/collect-licences.mjs` does, and so does
 * `licences.test.ts`, so the list the tests check is the one the collector reads.
 */
export const SHIPPED: string[] = [
  // Runtime dependencies, loaded from `node_modules` rather than bundled.
  '@jitl/quickjs-singlefile-browser-release-sync',
  'jolt-physics',
  '@mdi/js',
  '@mdi/react',
  '@modelcontextprotocol/sdk',
  '@pasquelin/panels',
  '@scenario-labs/sdk',
  'ag-psd',
  'better-sqlite3',
  'electron-store',
  'electron-updater',
  'fflate',
  'mediabunny',
  'node-llama-cpp',
  'opentype.js',
  'pixi.js',
  'quickjs-emscripten-core',
  'sherpa-onnx-node',
  'simple-git',
  'three',
  'three-bvh-csg',
  'three-mesh-bvh',
  'utif',
  // The runtime itself.
  'electron',
  // Bundled into the renderer by Vite, hence in `devDependencies` while shipping all the same.
  '@hookform/resolvers',
  '@tanstack/react-query',
  '@tanstack/react-virtual',
  'daisyui',
  'dockview-react',
  'i18next',
  'immer',
  // The code editor and its TypeScript worker, in a chunk of their own — loaded on first open.
  'monaco-editor',
  'react',
  'react-dom',
  'react-hook-form',
  'react-i18next',
  'react-is',
  'react-markdown',
  'react-tooltip',
  'recharts',
  'remark-gfm',
  'tailwind-merge',
  'tailwindcss',
  // Shipped since the scripts lot: `transpileModule` turns an author's TypeScript into what the
  // sandbox runs, in a worker of the renderer. It is a build tool everywhere else.
  'typescript',
  'wavesurfer.js',
  'zod',
  'zustand',
]

/**
 * The other half of the same partition: declared, never shipped. They run on the machine that
 * builds and never reach a user, so the notice owes them nothing.
 *
 * Beside `SHIPPED` rather than in the suite that reads it, and that is the whole point: the two
 * lists are one decision written twice, and they lived in different folders — a package added to
 * the manifest had to be classified in `src/main` or in a test of `src/shared`, and whoever added
 * it saw only one of the two. `licences.test.ts` confronts them with the manifest.
 *
 * Neither list is DERIVED from the other, and that is deliberate: a new dependency belongs to
 * neither until someone says which, and the red is what asks. Deriving one would make the answer
 * "build tool" by default — silently, for a package that may well ship.
 */
export const BUILD_ONLY: string[] = [
  '@electron/rebuild',
  '@eslint/js',
  '@tailwindcss/vite',
  '@testing-library/jest-dom',
  '@testing-library/react',
  '@testing-library/user-event',
  '@types/better-sqlite3',
  '@types/node',
  '@types/react',
  '@types/react-dom',
  '@types/react-is',
  '@types/three',
  '@vitejs/plugin-react',
  'dry-ts',
  'electron-builder',
  'electron-vite',
  'eslint',
  'eslint-plugin-react-hooks',
  'jscpd',
  'jsdom',
  'knip',
  'oxlint',
  'oxlint-tsgolint',
  'prettier',
  'prettier-plugin-tailwindcss',
  'typescript-eslint',
  'typescript-7',
  'vite',
  'vitest',
]
