import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LEAST_GUARDS, MOST_SLACK, readsTheTree, wideGuardsUnder } from './wideGuards'

const ROOT = join(import.meta.dirname, '..', '..')
const GUARDED = wideGuardsUnder(join(ROOT, 'src')).map(path => path.replace(`${ROOT}/`, ''))

/** A borrower's own path, which is what lets the sweep behind an import be followed and read. */
const from = (path: string): string => join(ROOT, path)

describe('finding the tests no import graph reaches', () => {
  it('sees a glob standing for files it does not name, and leaves a single-file one alone', () => {
    expect(readsTheTree("const all = import.meta.glob('./**/*.tsx', { query: '?raw' })")).toBe(true)
    expect(readsTheTree("const one = import.meta.glob('./PropertyRow.tsx')")).toBe(false)
  })

  /**
   * A single-file glob is NOT reached by the import graph once it asks for `?raw`, and this case
   * says so where the one above used to claim the opposite: Vite gives the raw text another module
   * id, so `related` follows nothing. `rootErrors.test.tsx` reads `main.tsx` exactly that way, and
   * nothing imports `main.tsx` at all — it has a top-level await and mounts.
   */
  it('sees a file inlined at build time, however narrowly it was asked for', () => {
    expect(readsTheTree("import sheet from './index-foundation.css?raw'")).toBe(true)
    expect(readsTheTree("const one = import.meta.glob('./main.tsx', { query: '?raw' })")).toBe(true)
    expect(readsTheTree("await import('./timeline?raw')")).toBe(true)
    // Prose about `?raw` is not a read. The quotes are what tell them apart.
    expect(readsTheTree('// inlined through ?raw by the harness')).toBe(false)
  })

  /**
   * One folder deep counts, and a net that only knew `**` left these out while they are exactly
   * what it exists for. `SettingLine` was the second of them until its rule moved to a shared
   * constant on 2026-08-17, so only the spelling it used is still anchored on a real file below.
   */
  it('sees a wildcard that stays in its own folder', () => {
    expect(readsTheTree("import.meta.glob('./*.tsx', { query: '?raw' })")).toBe(true)
    expect(readsTheTree("import.meta.glob('./*Field.tsx', { query: '?raw' })")).toBe(true)
  })

  it('holds the one the narrow reading missed', () => {
    expect(GUARDED).toContain('src/renderer/src/components/stylesRows.test.ts')
  })

  /**
   * A path worked out from the suite's own location reaches the repository; a fixture reads from
   * a temporary folder instead. These four read `index.html`, the notices, the `.lproj` strings
   * and the config files, and nothing imports any of them.
   */
  it('sees a read anchored on the suite own location, and not a fixture', () => {
    expect(readsTheTree("readFileSync(join(import.meta.dirname, '..', 'LICENSE'), 'utf8')")).toBe(
      true,
    )
    expect(readsTheTree("readFileSync(new URL('../index.html', import.meta.url), 'utf8')")).toBe(
      true,
    )
    expect(
      readsTheTree("const dir = await mkdtemp(tmpdir())\nreadFileSync(join(dir, 'a.json'))"),
    ).toBe(false)
  })

  it('holds the four that read the repository without importing it', () => {
    expect(GUARDED).toEqual(
      expect.arrayContaining([
        'src/main/window/csp.test.ts',
        'src/main/licences.test.ts',
        'src/main/permission-strings.test.ts',
        'src/main/gate-caches.test.ts',
      ]),
    )
  })

  it('sees a walk of the disk and a read of what is data rather than a module', () => {
    expect(readsTheTree("readdirSync(join(ROOT, 'src'))")).toBe(true)
    expect(readsTheTree("readFileSync('vitest.config.ts', 'utf8')")).toBe(true)
  })

  /**
   * A guard sweeping every TRACKED file touches neither `fs` nor a glob, and sat outside the net
   * for a day — the short loop stayed green on the very defect it had been written to refuse.
   */
  it('sees the suite that asks git for the tree rather than reading it', () => {
    expect(readsTheTree("execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT })")).toBe(true)
    expect(readsTheTree("execFileSync(\n  'git',\n  ['grep', '-In', NEEDLE],\n)")).toBe(true)
    expect(readsTheTree("execFileSync('node', ['scripts/check.mjs'])")).toBe(false)
  })
})

describe('wide guard coverage', () => {
  it('leaves an ordinary suite alone, which is what keeps the selection worth making', () => {
    expect(readsTheTree("import { Tree } from './Tree'\nrender(<Tree />)")).toBe(false)
  })

  /**
   * A guard that borrows `sourceFiles.ts` reads the tree without a `readdirSync` of its own — and
   * the day that module was extracted, `no-bare-locale-compare.test.ts` fell out of the net exactly
   * that way while the count still read 36 and looked healthy.
   */
  it('sees the suite that borrows the shared sweep rather than writing one', () => {
    const main = from('src/main/probe.test.ts')

    expect(readsTheTree("import { sourceFiles } from './sourceFiles'", main)).toBe(true)
    expect(readsTheTree("import { PROJECT_TREES } from '@main/sourceFiles'", main)).toBe(true)
    // A guard one folder down, which the first version of the rule would have dropped.
    const deeper = from('src/main/window/probe.test.ts')
    expect(readsTheTree("import { sourceFiles } from '../sourceFiles'", deeper)).toBe(true)
    expect(GUARDED).toContain('src/main/no-bare-locale-compare.test.ts')
    expect(GUARDED).toContain('src/main/no-hardcoded-text.test.ts')
  })

  /**
   * The borrowed module is RESOLVED and read, never matched on its name — which is the whole point:
   * a name list is what let `index.css` become three files under other names in silence. A module
   * that reads nothing leaves its importer alone, or the net would hold the entire suite.
   */
  it('follows the import to the module, and only when that module is a sweep', () => {
    const main = from('src/main/probe.test.ts')

    expect(readsTheTree("import { clamp } from '@shared/numeric'", main)).toBe(false)
    expect(readsTheTree("import { thing } from './nothing-of-this-repository'", main)).toBe(false)
    expect(readsTheTree("import { render } from '@testing-library/react'", main)).toBe(false)
  })

  /**
   * The four the split dropped, and the reason this case names them rather than counting: the lot
   * that lost them ADDED five elsewhere, so the count went up while the tightest colour guard of
   * the repository left the short loop. Membership is what a count cannot say.
   */
  it('holds the design guards that read a stylesheet through a shared module', () => {
    expect(GUARDED).toEqual(
      expect.arrayContaining([
        'src/renderer/src/components/tokensContrast.test.ts',
        'src/renderer/src/components/tokensHue.test.ts',
        'src/renderer/splash.test.ts',
        'src/renderer/src/features/scene/components/Camera/CameraPreview.test.tsx',
      ]),
    )
  })

  /**
   * The three spellings of the renderer's own sweep, and the reason all three are named: the
   * guards that sit BESIDE `testHarness.ts` write the bare one, those elsewhere write the
   * folder-qualified one. A rule taught only the second caught five guards and left five others
   * out — two of them with no other way in, and the floor far too high to notice.
   */
  it('sees the three ways the renderer sweep is borrowed', () => {
    const beside = from('src/renderer/src/components/probe.test.ts')
    const elsewhere = from('src/renderer/src/stores/probe.test.ts')

    expect(readsTheTree("import { WRITTEN_SOURCES } from './testHarness'", beside)).toBe(true)
    expect(
      readsTheTree("import { WRITTEN_SOURCES } from '../components/testHarness'", elsewhere),
    ).toBe(true)
    expect(readsTheTree("import { SUITE_SOURCES } from '@/components/testHarness'", beside)).toBe(
      true,
    )
    expect(GUARDED).toContain('src/renderer/src/components/spacing.test.ts')
    expect(GUARDED).toContain('src/renderer/src/stores/job-fixtures.test.ts')
  })

  /**
   * The one the whole short loop rests on. `no-hardcoded-text` reads every component through
   * `?raw`, so touching a component selects that component's own tests and not this one — the
   * green that would let a hardcoded word merge.
   */
  it('holds the guard that reads every component, which nothing imports', () => {
    expect(GUARDED).toContain('src/renderer/src/no-hardcoded-text.test.ts')
  })

  /** Why a floor at all is on `LEAST_GUARDS`; this is it checked against the tree it will read. */
  it('finds enough of them that a broken detector would say so', () => {
    expect(GUARDED.length).toBeGreaterThanOrEqual(LEAST_GUARDS)
  })

  /**
   * The half a floor cannot hold on its own: it drifts DOWNWARDS as guards are added, and nothing
   * says so. Measured on 2026-08-19 — 67 guards against a floor of 50, so a silent loss of
   * seventeen would have passed, the very failure the floor was raised to 50 to stop.
   */
  it('stays close enough to the count that a real loss would still fail', () => {
    expect(GUARDED.length - LEAST_GUARDS).toBeLessThanOrEqual(MOST_SLACK)
  })
})
