/**
 * 🛑 Jolt's wasm-compat does `await import("node:module")`. Vite lib mode hoists it onto
 * `runtime.js`, Chrome answers ERR_FAILED, and the exported game never starts — measured
 * 2026-09-06, black screen, 0 non-black pixels.
 */
export function withoutNodeModuleImport(source: string): string {
  return source.replaceAll('await import("node:module")', '({ createRequire: () => () => ({}) })')
}
