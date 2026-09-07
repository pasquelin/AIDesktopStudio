import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from '../../package.json'

/**
 * The two detectors that answer a question no other gate asks: what is dead, and what is written
 * twice. knip judges — fifth link of `pnpm validate` since 2026-08-17 — while jscpd only reports;
 * either way **nothing else in the suite goes red the day one of them is quietly turned off**,
 * which is why these cases exist. The same reasoning as `gate-caches.test.ts`, one file over.
 *
 * A detector reads its own config file, and every way of blinding one ends in the same place: it
 * reports zero and looks like good news. A raised token floor, a path that no longer names `src`,
 * an ignore that swallows the tree — each is one line, and each turns a measurement into a green
 * tick nobody can tell from a clean repository.
 *
 * Under `src/main` rather than `src/shared`: these files sit at the repository root, and
 * `src/shared` compiles for the renderer, which cannot read a disk.
 */
const ROOT = join(import.meta.dirname, '..', '..')

const read = (name: string): string => readFileSync(join(ROOT, name), 'utf8')
const readJson = (name: string): unknown => JSON.parse(read(name))

/**
 * The floor jscpd was measured at. Sixty tokens over 1281 files found 121 clones — 1217 lines,
 * 0.60 % — stable across consecutive runs with the config as shipped.
 *
 * **Eleven** have test material on neither side, by the definition this repository already
 * applies (`import-cycles.test.ts`, `TEST_MATERIAL`); ten once the pair inside `index.css` is set
 * aside. Both counts are the same number read two ways, not two measurements. The largest is the
 * three blocks `AnimationCanvas` and `TimelineCanvas` share — 23 + 17 + 19 = 59 lines.
 *
 * A higher floor is a shorter list, and a list nobody asked to shorten.
 */
const MIN_TOKENS = 60

const jscpd = (): Record<string, unknown> => {
  const config = readJson('.jscpd.json')
  if (typeof config !== 'object' || config === null) throw new Error('.jscpd.json is not an object')
  return { ...config }
}

describe('the duplication detector still looking at the tree', () => {
  it('is pointed at the sources', () => {
    expect(jscpd()['path']).toEqual(['src'])
  })

  /** Raising it is how a clone list shrinks without a clone being removed. */
  it('keeps the token floor it was measured at, or lower', () => {
    expect(jscpd()['minTokens']).toBeLessThanOrEqual(MIN_TOKENS)
  })

  /**
   * `public/` holds two font licences that are 91 identical lines by their authors' intent, and
   * the transcoder blobs. Anything reaching further would hide code rather than data — an ignore
   * naming `src` itself, or a bare glob, empties the run while leaving the file looking configured.
   */
  it('ignores data and nothing that could hold code', () => {
    const ignored = jscpd()['ignore']
    expect(ignored).toEqual(['**/public/**'])
  })

  it('is reachable by a name, not only by remembering the binary', () => {
    expect(manifest.scripts.duplication).toContain('jscpd')
  })
})

/**
 * dry-ts sees Type-2/3 clones that jscpd cannot — same shape, names forgotten. It reports, it
 * does not gate: a fail-on-any-cluster would go red on ipc ↔ main ↔ renderer, which is written
 * twice on purpose. **What it does not see:** two components of the same role with different JSX.
 */
const dryTs = (): Record<string, unknown> => {
  const config = readJson('.dry-ts.json')
  if (typeof config !== 'object' || config === null)
    throw new Error('.dry-ts.json is not an object')
  return { ...config }
}

/**
 * What knip is told to overlook, and why each line is there.
 *
 * These are not a widening of the reach — the probe below shows nothing widens it. Each names a
 * file reached by something other than an import:
 *
 * `uv` is the engine's own toolchain, and it is NOT installed by `pnpm install`: `engine-check.mjs`
 * shells out to it and names it when it is missing. The two macOS ones belong to
 * `dev-app-identity.mjs`.
 *
 * `before-pack.mjs` and `after-pack.mjs` are called by `electron-builder.yml` through configuration.
 * Deleting the first would stop ffmpeg being fetched; deleting the second would let an unusable
 * embedded AI runtime ship.
 *
 * `site/assets/js/*.js` and the stylesheet beside them are loaded by `site/template.html` — the
 * public site, which knip does not parse. The scripts are entry points because they hold code; the
 * CSS is ignored outright, having no graph to enter.
 *
 * `vendor/**` is the physics engine we compile ourselves: a package the manifest depends on by
 * `file:`, so what reaches it goes through `node_modules` and knip reads its files as orphans.
 *
 * `.agents/**` is in `.git/info/exclude`, copied into every worktree so the contract travels with
 * the branch. Knip does not honour that exclude: 28 unused-file hits, every one a tool no import
 * reaches, measured 2026-09-03 on a worktree that had only copied `.agents`.
 *
 * `scripts/*.d.mts`: knip reads a declaration file as unimported, never as the types OF the
 * sibling it declares. Measured on `check-sizes.d.mts` — deleting it fails the typecheck with
 * TS7016 on `check-sizes.test.ts`, which imports the `.mjs`.
 *
 * They are here because a detector that always reports the same false positives is a detector
 * whose red gets read as normal. The three entry points for `src/main`, `src/preload` and the
 * renderer are NOT here: knip finds them itself and reports each as redundant, which is what
 * separates a genuine blind spot from a second description of the build drifting from the first.
 */
const KNIP_CONFIG = {
  $schema: 'https://unpkg.com/knip@6/schema.json',
  ignoreBinaries: ['sips', 'iconutil', 'uv'],
  entry: ['scripts/before-pack.mjs', 'scripts/after-pack.mjs', 'site/assets/js/*.js'],
  ignore: ['site/assets/css/**', 'vendor/**', '.agents/**', 'scripts/*.d.mts'],
}

describe('the structural duplicate detector still looking at the tree', () => {
  it('drops tests and fixtures, not the sources', () => {
    expect(dryTs()['excludeTests']).toBe(true)
    expect(dryTs()['exclude']).toEqual([
      '**/fixtures/**',
      '**/*-fixtures.ts',
      '**/*-fixtures.tsx',
      '**/public/**',
    ])
  })

  it('is reachable by a name, not only by remembering the binary', () => {
    expect(manifest.scripts.dry).toContain('dry-ts')
    expect(manifest.scripts['duplication:report']).toContain('scripts/duplication-report.mjs')
  })

  it('is a report, not a link of the gate', () => {
    expect(manifest.scripts.validate).not.toContain('pnpm dry')
    expect(manifest.scripts.validate).not.toContain('duplication:report')
  })
})

/**
 * **knip reaches `src/main` and nothing else here, and no configuration found so far changes
 * that.** Measured, not assumed: the same unreachable export appended to `src/main/log.ts`, to
 * `src/renderer/src/helpers/cn.ts` and to `src/shared/hash.ts` is reported for the first alone.
 * Five configurations were tried and none moved it — explicit entry lists for all three targets,
 * `--tsConfig` pointed at `tsconfig.web.json` and at `tsconfig.node.json`, a `workspaces` block, a
 * `paths` map for the three aliases, and `includeEntryExports`. The renderer's files ARE reached —
 * none is reported as an unused file — so this is not a project that stops at `src/main`.
 *
 * Hence the script is `unused:main` and not `unused`: the name is the scope. A detector whose
 * reach is a third of the tree is worth having; one presented as covering all of it is worse than
 * none, because a clean run then reads as a clean repository.
 */
describe('the dead-code detector still looking at the tree', () => {
  it('exempts the shelled-out binaries and what knip cannot see is used', () => {
    const config = readJson('knip.json')
    expect(config).toEqual(KNIP_CONFIG)
  })

  /**
   * The reason the entry above exists, held rather than described: a rename of the script or of
   * the hook would leave the two pointing at different files, and the packaging failure would
   * surface as a build shipping without an encoder.
   */
  it('names both scripts electron-builder calls around packaging', () => {
    expect(read('electron-builder.yml')).toContain('beforePack: scripts/before-pack.mjs')
    expect(read('electron-builder.yml')).toContain('afterPack: scripts/after-pack.mjs')
  })

  /**
   * The name carries the scope, so renaming it to a bare `unused` in the belief that the reach
   * widened is what this case refuses. Nothing here can measure the reach itself: one knip run
   * costs 3.39 s, median of five on 2026-08-17, which no suite case may spend.
   */
  it('is named for the third of the tree it actually reaches', () => {
    expect(manifest.scripts['unused:main']).toContain('knip')
    expect(manifest.scripts).not.toHaveProperty('unused')
  })

  /**
   * A detector nobody's gate calls is read the day somebody remembers it: this one was red a whole
   * day on 2026-08-17, then again the same evening. Last by decision, not by need — knip reads
   * sources, so it would run as well first, in 3 s against the minute the four before it take.
   */
  it('is a link of the gate, not a report waiting for someone to run it', () => {
    expect(manifest.scripts.validate).toContain('pnpm unused:main')
  })
})
