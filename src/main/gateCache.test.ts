import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, onTestFinished } from 'vitest'
import { CACHE_DIR, filesRead, fingerprinterFor, markerNameOf, treeOf } from './gateCache'
import { GATE } from './gateLinks'
import manifest from '../../package.json'
import { pathIsInside } from './export/pathIsInside'

const ROOT = join(import.meta.dirname, '..', '..')
const LINK = { command: 'pnpm nothing', reads: ['read.txt'] }
const WHOLE = { command: 'pnpm nothing', reads: ['.'] }

/** The three files every fingerprint carries, plus whatever the case is about. */
function repositoryWith(extra: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'gate-cache-'))
  onTestFinished(() => rmSync(root, { recursive: true, force: true }))

  const files = { 'package.json': '{}', 'pnpm-lock.yaml': 'lock', '.nvmrc': '24', ...extra }
  execFileSync('git', ['init', '-q'], { cwd: root })
  for (const [name, contents] of Object.entries(files)) writeFileSync(join(root, name), contents)
  execFileSync('git', ['add', '-A'], { cwd: root })
  return root
}

const fingerprintOf = (root: string, runtime = 'v24') =>
  fingerprinterFor(root, runtime, [LINK, WHOLE])

describe('what a link has to read for its verdict to still hold', () => {
  it('moves the fingerprint when a file the link reads changes', () => {
    const root = repositoryWith({ 'read.txt': 'before' })
    const before = fingerprintOf(root)(LINK)

    writeFileSync(join(root, 'read.txt'), 'after')

    expect(fingerprintOf(root)(LINK)).not.toBe(before)
  })

  /**
   * The resolved dependencies and the runtime are not files a link names, and both change what it
   * would answer — a lockfile bump is the case that would otherwise stay cached through an upgrade.
   */
  it('moves it when the lockfile or the runtime changes, which no link names', () => {
    const root = repositoryWith({ 'read.txt': 'x' })
    const before = fingerprintOf(root)(LINK)

    expect(fingerprintOf(root, 'v25')(LINK)).not.toBe(before)

    writeFileSync(join(root, 'pnpm-lock.yaml'), 'moved')
    expect(fingerprintOf(root)(LINK)).not.toBe(before)
  })

  /** Untracked and not ignored is a file the link reads: a test written and not yet added. */
  it('counts a file that git has never been told about', () => {
    const root = repositoryWith({ 'read.txt': 'x' })
    const before = fingerprintOf(root)(WHOLE)

    writeFileSync(join(root, 'fresh.txt'), 'new')

    expect(fingerprintOf(root)(WHOLE)).not.toBe(before)
  })

  it('leaves out what git ignores, so node_modules never enters a fingerprint', () => {
    const root = repositoryWith({ '.gitignore': 'built\n' })
    writeFileSync(join(root, 'built'), 'artefact')

    expect(treeOf(root, [])).not.toContain('built')
  })

  /** One listing serves every link, so the filter has to give back what a listing per link did. */
  it('gives a link the paths under what it named, and nothing beside', () => {
    const tree = ['config/a.ts', 'src/one.ts', 'src/deep/two.ts', 'srcery.ts']

    expect(filesRead(tree, { command: 'x', reads: ['src'] })).toEqual([
      'src/one.ts',
      'src/deep/two.ts',
    ])
    expect(filesRead(tree, WHOLE)).toEqual(tree)
  })
})

describe('the gate that cannot cache a link it has not described', () => {
  /**
   * The one rule that keeps this safe from the inside: a link added to the chain and left without
   * inputs would be cached on a fingerprint that watches nothing.
   */
  it('gives every link at least one path it reads, and each one exists', () => {
    for (const link of GATE) {
      expect(link.reads.length, link.command).toBeGreaterThan(0)
      for (const path of link.reads) {
        expect(existsSync(join(ROOT, path)), `${link.command} reads ${path}`).toBe(true)
      }
    }
  })

  /**
   * Knip finds a build script through the package scripts and nowhere else: the one link once
   * spelled `node scripts/check-as-const.mjs` made that file read as unused the day the chain left
   * `package.json`.
   */
  it('spells every link as a package script, which is how knip reaches it', () => {
    for (const { command } of GATE) {
      expect(command.startsWith('pnpm '), command).toBe(true)
      expect(manifest.scripts, command).toHaveProperty(command.slice('pnpm '.length))
    }
  })

  it('runs the gate through its own script, so no link escapes the fingerprint', () => {
    expect(manifest.scripts.validate).toBe('node scripts/gate.mjs')
  })

  /**
   * A marker git carries would make a clone green on somebody else's verdict. `node_modules/` is
   * ignored whole, which is what `gate-caches.test.ts` already demands of the compiler caches.
   */
  it('keeps its markers where no clone can carry them', () => {
    expect(pathIsInside(join(ROOT, 'node_modules'), join(ROOT, CACHE_DIR))).toBe(true)
  })

  it('names a marker after the command it remembers', () => {
    expect(markerNameOf('pnpm format:check')).toBe('pnpm-format-check')
  })
})
