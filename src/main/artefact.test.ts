import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { filesUnder, replaceDirectory, shippedTwice, wastedBytes } from './artefact'
import manifest from '../../package.json'

// Under `src/main` rather than `src/shared`: it judges what sits at the repository root, and
// `src/shared` compiles for the renderer, which has no filesystem.
function folderHolding(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'artefact-'))

  for (const [path, content] of Object.entries(files)) {
    const file = join(root, path)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, content)
  }

  return root
}

describe('what a build ships twice', () => {
  it('keeps a complete runtime when staging reports a truncated download', async () => {
    const root = mkdtempSync(join(tmpdir(), 'artefact-runtime-'))
    const runtime = join(root, 'ffmpeg')
    mkdirSync(runtime)
    writeFileSync(join(runtime, 'ffmpeg'), 'verified')

    await expect(
      replaceDirectory(runtime, async () => {
        throw new Error('closed at 3 bytes, expected 10')
      }),
    ).rejects.toThrow('closed at 3 bytes')

    expect(readFileSync(join(runtime, 'ffmpeg'), 'utf8')).toBe('verified')
    expect(existsSync(join(runtime, 'ffprobe'))).toBe(false)
    expect(readdirSync(root).filter(entry => entry.startsWith('.ffmpeg-'))).toEqual([])
  })
  it('names every path holding the same bytes, once', () => {
    const root = folderHolding({
      'renderer/assets/transcoder-a1b2.wasm': 'the same bytes',
      'renderer/decoders/basis/transcoder.wasm': 'the same bytes',
      'renderer/assets/index.js': 'something else',
    })

    const copies = shippedTwice(root, filesUnder(root))

    expect(copies).toHaveLength(1)
    expect(copies[0]?.paths.map(path => path.slice(root.length + 1)).sort()).toEqual([
      'renderer/assets/transcoder-a1b2.wasm',
      'renderer/decoders/basis/transcoder.wasm',
    ])
  })

  /** Neither program can load the other's file, and `shared/` compiles into both. */
  it('does not call the same helper in two programs a copy', () => {
    const root = folderHolding({
      'main/promises-a1b2.js': 'the same bytes',
      'renderer/assets/promises-a1b2.js': 'the same bytes',
    })

    expect(shippedTwice(root, filesUnder(root))).toEqual([])
  })

  /** The root of the artefact is no program, so what lies there is one set — `out/` holds none. */
  it('judges two files lying at the root of the artefact as copies of each other', () => {
    const root = folderHolding({ 'one.js': 'the same bytes', 'two.js': 'the same bytes' })

    expect(shippedTwice(root, filesUnder(root))).toHaveLength(1)
  })

  it('leaves an artefact where every file is its own alone', () => {
    const root = folderHolding({
      'main/a.js': 'one',
      'main/nested/b.js': 'two',
      'main/nested/deep/c.js': 'three',
    })

    expect(filesUnder(root)).toHaveLength(3)
    expect(shippedTwice(root, filesUnder(root))).toEqual([])
  })

  /**
   * Two of them are the same bytes by definition, and a copy that weighs nothing is not one worth
   * failing a build over. This is the whole tolerance the check has — see `artefact.ts`.
   */
  it('does not call two empty files a copy', () => {
    const root = folderHolding({ 'main/one.txt': '', 'main/two.txt': '' })

    expect(shippedTwice(root, filesUnder(root))).toEqual([])
  })

  it('counts every path beyond the first, at its own weight', () => {
    const root = folderHolding({
      'main/a.bin': 'sixteen bytes!!',
      'main/b.bin': 'sixteen bytes!!',
    })
    const copies = shippedTwice(root, filesUnder(root))

    expect(wastedBytes(copies)).toBe(15)
  })
})

/**
 * The check has to run where the artefact is, and a build is the only moment it exists.
 *
 * `pnpm build` is not enough on its own: the integration job runs `electron-vite build` directly,
 * to spare the second typecheck, so the check has to be named there too. Both sites are asserted
 * because nothing else would notice either one going missing — a build without it is a green
 * build, and that is exactly what this lot found in the artefact.
 */
describe('the artefact check', () => {
  it('runs at the end of every local build, hence of every package', () => {
    expect(manifest.scripts.build).toContain('check-artefact.mjs')
    expect(manifest.scripts.dist).toContain('pnpm build')
  })

  /**
   * Read as steps rather than as text: a commented-out `# - run: …` still contains the words, and
   * a guard that a `#` disarms is one the next rebase disarms by accident.
   */
  it('runs in the job that builds before a merge, which does not call `pnpm build`', () => {
    const ci = readFileSync(
      join(import.meta.dirname, '..', '..', '.github/workflows/ci.yml'),
      'utf8',
    )
    const steps = ci.split('\n').filter(line => !/^\s*#/.test(line))

    expect(steps.join('\n')).toContain('electron-vite build')
    expect(steps).toContainEqual(
      expect.stringMatching(/^\s*- run: node scripts\/check-artefact\.mjs\s*$/),
    )
  })
})
