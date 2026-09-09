import { readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

/** A change here moves more than an import graph can follow, so nothing narrower than all of it. */
export const RERUN_EVERYTHING: readonly string[] = [
  'vitest.config.ts',
  'package.json',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'config/tsconfig.base.json',
  'config/tsconfig.node.json',
  'config/tsconfig.web.json',
  'config/tsconfig.banc.json',
  'config/vite.game.config.ts',
  'config/vitest.banc.config.ts',
  'config/vitest.mission-banc.config.ts',
  'oxlint.json',
  '.prettierrc',
]

/**
 * Every tsconfig `pnpm typecheck` compiles under, parents included — `extends` chains, so a
 * change to a base nobody names governs all three passes.
 *
 * 🛑 Blind spot: a tsconfig carrying `//` comments is legal JSONC and throws here rather than
 * reporting. That is loud, unlike the silence this guard exists to break.
 */
export function typecheckConfigsOf(root: string, typecheckScript: string): string[] {
  const seen = new Set<string>()
  const walk = (path: string): void => {
    const at = relative(root, resolve(root, path))
    if (seen.has(at)) return
    seen.add(at)

    const extended: unknown = JSON.parse(readFileSync(join(root, at), 'utf8')).extends
    // An array is as legal as a string, and skipping it would leave a base unlisted in silence.
    // A specifier that does not open with a dot names a package, which lives outside the tree.
    for (const one of Array.isArray(extended) ? extended : [extended]) {
      if (typeof one === 'string' && one.startsWith('.')) walk(join(dirname(at), one))
    }
  }

  const flag = /(?:-p|--project)[\s=]+(\S+)/g
  for (const [, path] of typecheckScript.matchAll(flag)) if (path !== undefined) walk(path)
  return [...seen]
}
