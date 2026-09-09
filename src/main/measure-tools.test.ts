import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from '../../package.json'
import { GATE } from './gateLinks'
import { SOURCE_ROOT } from './sourceFiles'
import { testFilesUnder } from './wideGuards'

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

/** A detector's own settings, read as an object rather than as whatever the file holds. */
const settingsOf = (name: string): Record<string, unknown> => {
  const config = readJson(name)
  if (typeof config !== 'object' || config === null) throw new Error(`${name} is not an object`)
  return { ...config }
}

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

const jscpd = (): Record<string, unknown> => settingsOf('.jscpd.json')

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
const dryTs = (): Record<string, unknown> => settingsOf('.dry-ts.json')

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
 * `src/renderer/src/game/exportEntry.ts` is the bundle an exported game starts on, declared as
 * `build.lib.entry` by `config/vite.game.config.ts` — a vite config away from the root, which knip
 * does not read. Its only caller is the page `main/export/gameExport.ts` writes, which imports
 * `startExportedGame` from `runtime.js` inside a string: an import no resolver follows, so without
 * this line knip reports the one export an exported game cannot start without.
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
 * `tags: -@adr` names no file: it drops from the report any export whose JSDoc carries `@adr`.
 * `PortOccupancy` and `RuntimeCapabilities` in `shared/domain/aiRuntime.ts` are the two, published
 * by `docs/ci/adr/ADR-18-capacites-runtime-par-porte.md` and reached by no import yet — knip is
 * right that nothing calls them and wrong about what to do next, since deleting them would leave
 * the ADR describing code that does not exist. An exemption written on the declaration rather
 * than on a path is what keeps that reason beside the type, and what expires with it.
 *
 * It goes on a SHAPE an ADR publishes, never on the axis types that shape is built from: ADR-18
 * quotes those INLINE, so seven of the eight lost their export in the same batch without costing
 * the document a line — `Residency` kept its own because `aiMemory.ts` imports it.
 * `ConstraintSource` is that case one ADR on, inside a `Governed<T>` ADR-19 does publish.
 *
 * `ignoreIssues` drops ONE issue type for ONE file, and `renderPolicy.ts` is the only entry: the
 * two JSDoc blocks there argue why `SCATTER_DISTANCE = VIEW_DISTANCE` is an equality on purpose,
 * and are the reason not to repeat here. `tags` cannot express it: measured on 2026-09-08, an
 * `@adr` on `SCATTER_DISTANCE` left the duplicate reported and knip answered `Unused tag` — the
 * option filters exports, and a duplicate is a pair.
 *
 * They are here because a detector that always reports the same false positives is a detector
 * whose red gets read as normal. The three entry points for `src/main`, `src/preload` and the
 * renderer are NOT here: knip finds them itself and reports each as redundant, which is what
 * separates a genuine blind spot from a second description of the build drifting from the first.
 */
const KNIP_CONFIG = {
  $schema: 'https://unpkg.com/knip@6/schema.json',
  ignoreBinaries: ['sips', 'iconutil', 'uv'],
  entry: [
    'scripts/before-pack.mjs',
    'scripts/after-pack.mjs',
    'site/assets/js/*.js',
    'src/renderer/src/game/exportEntry.ts',
  ],
  ignore: ['site/assets/css/**', 'vendor/**', '.agents/**', 'scripts/*.d.mts'],
  tags: ['-@adr'],
  ignoreIssues: { 'src/shared/domain/renderPolicy.ts': ['duplicates'] },
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
 * **knip no longer stops at `src/main`, and it does not cover the tree either.** knip 6.35 stopped
 * counting a `?raw` glob as an import, and the guards of this repository read their own sources
 * that way — so every file they sweep used to pass for imported and every export of it for read.
 * Lifting that mask surfaced 328 unread exports in one step, most of them under `src/renderer`.
 *
 * Remeasured on 2026-09-08, not assumed: the same unreachable export appended to seven files is
 * reported for `src/main/log.ts`, `src/renderer/src/helpers/cn.ts`, `src/game/pooled.ts` and
 * `src/shared/domain/otio.ts`, and stays silent for `src/shared/hash.ts`, for the i18n barrel and
 * for `src/preload/index.ts`. The boundary is therefore not a directory, and naming one would be
 * the mistake the old measurement made in the other direction.
 *
 * The script keeps the name `unused:main`, which now UNDERSTATES its reach rather than overstating
 * it — the safe direction, and a rename touches the gate. What the sentence above protects is
 * unchanged: a detector presented as covering the whole tree is worse than none, because a clean
 * run then reads as a clean repository.
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
   * The same bargain for the game bundle: a rename on either side would leave knip naming a file
   * vite no longer builds, and `startExportedGame` would go back to reading as a dead export.
   */
  it('names the file the game bundle is built from', () => {
    expect(read('config/vite.game.config.ts')).toContain('src/renderer/src/game/exportEntry.ts')
    expect(read('src/main/export/gameExport.ts')).toContain('startExportedGame')
  })

  /**
   * The other side of the `-@adr` line: an export the tag no longer sits on goes back to being
   * reported, and the shortest way out of that red is the deletion the ADR would then survive
   * alone. This is the only place the exemption and the two types it covers are held together.
   *
   * Swept across `src/` rather than read in `aiRuntime.ts`, because the option is repository wide:
   * a tag posted anywhere else would exempt that export with no test moving. Through
   * `testFilesUnder` and not `sourceFiles`, which skips tests, benches and fixtures — measured on
   * 2026-09-08, an `@adr` in a `-fixtures.ts` did exempt its export and left this case green.
   * This file is dropped from its own sweep: it spells the tag to name it.
   */
  it('carries the tag on the two types ADR-18 publishes and no import reaches', () => {
    const tagged = testFilesUnder(SOURCE_ROOT, /\.tsx?$/)
      .filter(file => file !== import.meta.filename)
      .filter(file => readFileSync(file, 'utf8').includes('@adr'))
    const source = read('src/shared/domain/aiRuntime.ts')

    for (const name of ['PortOccupancy', 'RuntimeCapabilities']) {
      expect(source, `${name} is no longer exported`).toContain(`export type ${name} = {`)
    }
    expect(tagged).toEqual([join(SOURCE_ROOT, 'shared', 'domain', 'aiRuntime.ts')])
    expect(source.match(/@adr/g)).toHaveLength(2)
  })

  /**
   * The other side of the `ignoreIssues` line: it blinds one file to one issue type, so it must
   * not outlive its reason. Fuse the two distances and the entry stops naming a false positive —
   * it starts hiding whatever duplicate lands in that file next, and nothing would say so.
   */
  it('leaves the two distances of renderPolicy standing apart', () => {
    expect(read('src/shared/domain/renderPolicy.ts')).toContain(
      'export const SCATTER_DISTANCE = VIEW_DISTANCE',
    )
  })

  /**
   * Nothing here can measure the reach the paragraph above states: one knip run costs 3.39 s,
   * median of five on 2026-08-17, which no suite case may spend.
   */
  it('keeps a name that understates the reach rather than claiming the tree', () => {
    expect(manifest.scripts['unused:main']).toContain('knip')
    expect(manifest.scripts).not.toHaveProperty('unused')
  })

  /**
   * A detector nobody's gate calls is read the day somebody remembers it: this one was red a whole
   * day on 2026-08-17, then again the same evening. Last by decision, not by need — knip reads
   * sources, so it would run as well first, in 3 s against the minute the four before it take.
   */
  it('is a link of the gate, not a report waiting for someone to run it', () => {
    expect(GATE.map(link => link.command)).toContain('pnpm unused:main')
  })
})
