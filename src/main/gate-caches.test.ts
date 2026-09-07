import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from '../../package.json'

/**
 * What keeps the gate from redoing, on every call, work it has already done.
 *
 * Measured on 12 August, twelve logical cores: prettier costs 10.1 s on all of `src/` and 1.6 s
 * with one file changed. The typecheck goes from 8.82 s to 3.21 s, five alternating pairs, ±1 %.
 *
 * None of this changes a verdict; it changes what gets recomputed. So nothing else in the suite
 * would go red the day a flag is dropped, which is why these cases exist.
 *
 * Under `src/main` rather than `src/shared`: these files sit at the repository root, and
 * `src/shared` compiles for the renderer.
 */
const ROOT = join(import.meta.dirname, '..', '..')
const read = (name: string) => readFileSync(join(ROOT, name), 'utf8')

/**
 * The flag itself, not a prefix of a longer one.
 */
const caches = (script: string) => /--cache(\s|$)/.test(script)

describe('the gate not rereading what it has already judged', () => {
  it('runs Oxlint over source and build scripts, rejecting warnings', () => {
    expect(manifest.scripts.lint).toContain('oxlint')
    expect(manifest.scripts.lint).toContain('-c oxlint.json')
    expect(manifest.scripts.lint).toContain('src scripts')
    expect(manifest.scripts.lint).toContain('--deny-warnings')
    expect(caches(manifest.scripts.lint)).toBe(false)
  })

  it('lets prettier skip the files it has already read, checking and writing alike', () => {
    expect(caches(manifest.scripts['format:check'])).toBe(true)
    expect(caches(manifest.scripts.format)).toBe(true)
  })

  /**
   * A cache written beside the source is a cache somebody commits. `node_modules/` is ignored
   * whole, and a fresh clone starts cold — which is what CI does on every run, so the cache can
   * never be what makes it green.
   */
  it('keeps reusable compiler caches out of the tree git tracks', () => {
    for (const config of ['tsconfig.node.json', 'tsconfig.web.json']) {
      expect(read(config)).toContain('"tsBuildInfoFile": "node_modules/')
    }
  })

  /**
   * `benchmark.include` is a setting of its own, with its own default — `**\/*.bench.*`, anchored
   * nowhere. A project that states its `include` and forgets this one keeps that default and
   * walks the whole disk from the repository root, which here means `.claude/worktrees/`: on
   * 2026-08-16 `pnpm bench` ran the benchmarks of two OTHER sessions' branches and printed their
   * numbers as this checkout's, 54 runs where 6 exist.
   *
   * One per project, because a project inherits nothing — the same reason `testTimeout` is
   * repeated three times a few lines below.
   */
  it('anchors every project’s benchmark glob, which inherits nothing and defaults to the disk', () => {
    const config = read('vitest.config.ts')
    const projects = [...config.matchAll(/name: '[\w-]+'/g)].length
    // `src/` OR `scripts/`: the bench's own fixtures live under the second, and a regex naming
    // only the first called an anchored glob unanchored.
    const anchored = [...config.matchAll(/benchmark: \{ include: \['(src|scripts)\//g)].length

    expect(projects).toBeGreaterThan(0)
    expect(anchored).toBe(projects)
  })

  /**
   * The two gates read `scripts/` as well as `src/`, and that is not a detail of taste: eleven
   * build scripts live there, and the build, the legal notices and the short loop itself run on
   * them. They were outside both gates until 2026-08-16 — `eslint src` and a `src/**` glob — so
   * a syntax slip in `collect-licences.mjs` only ever surfaced when the build broke.
   *
   * Held as a rule rather than left to habit: a glob narrowed back to `src` costs nothing to
   * write, reddens nothing, and puts eleven files back in the dark.
   */
  it('points both gates at the build scripts, not only at the sources', () => {
    expect(manifest.scripts.lint).toContain('scripts')
    // The pair, named rather than looped over: indexing the manifest by a string would need a
    // cast, and the two gates are two, not a list.
    for (const glob of [manifest.scripts.format, manifest.scripts['format:check']]) {
      expect(glob).toContain('{src,scripts}')
      expect(glob).toContain('mjs')
    }
  })

  it('lets tsc reuse its previous pass', () => {
    expect(read('tsconfig.base.json')).toContain('"incremental": true')
  })

  /**
   * The two passes are two programs. Pointed at one state file they overwrite each other every
   * time — measured: 9.43 s, then 9.74 s and 9.54 s "warm", against 3.21 s with one file each.
   * A gain that vanishes while every flag still reads as set is what this case exists to catch.
   */
  it('gives each of the two typecheck passes its own state file', () => {
    const node = read('tsconfig.node.json').match(/"tsBuildInfoFile": "([^"]+)"/)?.[1]
    const web = read('tsconfig.web.json').match(/"tsBuildInfoFile": "([^"]+)"/)?.[1]

    expect(node).toBeDefined()
    expect(web).not.toBe(node)
  })
})

/**
 * The active rules are syntax-only. This check keeps the mapped TypeScript rules explicit so that
 * a config rewrite cannot silently drop one while preserving a green lint command.
 */
describe('the Oxlint configuration preserving the TypeScript rules', () => {
  it('keeps the explicit type-only rules in the configuration', () => {
    const config = read('oxlint.json')

    for (const rule of [
      'typescript/no-explicit-any',
      'typescript/consistent-type-definitions',
      'typescript/consistent-type-imports',
      'no-unused-vars',
    ]) {
      expect(config).toContain(rule)
    }
  })
})
