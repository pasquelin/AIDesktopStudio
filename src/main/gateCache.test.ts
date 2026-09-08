import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, onTestFinished } from 'vitest'
import { CACHE_DIR, filesRead, fingerprinterFor, markerNameOf } from './gateCache'
import { GATE } from './gateLinks'
import manifest from '../../package.json'

const ROOT = join(import.meta.dirname, '..', '..')

/** A repository of three files, so a fingerprint can be watched moving. */
function repositoryWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'gate-cache-'))
  onTestFinished(() => rmSync(root, { recursive: true, force: true }))

  execFileSync('git', ['init', '-q'], { cwd: root })
  for (const [name, contents] of Object.entries(files)) writeFileSync(join(root, name), contents)
  execFileSync('git', ['add', '-A'], { cwd: root })
  return root
}

const BARE = { command: 'pnpm nothing', reads: ['read.txt'] }

describe('what a link has to read for its verdict to still hold', () => {
  it('moves the fingerprint when a file the link reads changes', () => {
    const root = repositoryWith({
      'package.json': '{}',
      'pnpm-lock.yaml': 'lock',
      '.nvmrc': '24',
      'read.txt': 'before',
    })
    const before = fingerprinterFor(root, 'v24')(BARE)

    writeFileSync(join(root, 'read.txt'), 'after')

    expect(fingerprinterFor(root, 'v24')(BARE)).not.toBe(before)
  })

  /**
   * The resolved dependencies and the runtime are not files a link names, and both change what it
   * would answer — a lockfile bump is the case that would otherwise stay cached through an
   * upgrade.
   */
  it('moves it when the lockfile or the runtime changes, which no link names', () => {
    const files = {
      'package.json': '{}',
      'pnpm-lock.yaml': 'lock',
      '.nvmrc': '24',
      'read.txt': 'x',
    }
    const root = repositoryWith(files)
    const before = fingerprinterFor(root, 'v24')(BARE)

    expect(fingerprinterFor(root, 'v25')(BARE)).not.toBe(before)

    writeFileSync(join(root, 'pnpm-lock.yaml'), 'moved')
    expect(fingerprinterFor(root, 'v24')(BARE)).not.toBe(before)
  })

  /** Untracked and not ignored is a file the link reads: a test written and not yet added. */
  it('counts a file that git has never been told about', () => {
    const root = repositoryWith({
      'package.json': '{}',
      'pnpm-lock.yaml': 'lock',
      '.nvmrc': '24',
      'read.txt': 'x',
    })
    const link = { command: 'pnpm nothing', reads: ['.'] }
    const before = fingerprinterFor(root, 'v24')(link)

    writeFileSync(join(root, 'fresh.txt'), 'new')

    expect(fingerprinterFor(root, 'v24')(link)).not.toBe(before)
  })

  it('leaves out what git ignores, so node_modules never enters a fingerprint', () => {
    const root = repositoryWith({
      'package.json': '{}',
      'pnpm-lock.yaml': 'lock',
      '.nvmrc': '24',
      '.gitignore': 'built\n',
    })
    writeFileSync(join(root, 'built'), 'artefact')

    expect(filesRead(root, ['.'])).not.toContain('built')
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

  it('runs the gate through its own script, so no link escapes the fingerprint', () => {
    expect(manifest.scripts.validate).toBe('node scripts/gate.mjs')
  })

  /**
   * A marker git carries would make a clone green on somebody else's verdict. `node_modules/` is
   * ignored whole, which is what `gate-caches.test.ts` already demands of the compiler caches.
   */
  it('keeps its markers where no clone can carry them', () => {
    expect(CACHE_DIR.startsWith('node_modules')).toBe(true)
    expect(markerNameOf('pnpm format:check')).toBe('pnpm-format-check')
  })
})
