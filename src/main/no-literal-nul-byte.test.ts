import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WHOLE_PROJECT } from './sourceFiles'

const ROOT = join(import.meta.dirname, '..', '..')
const NUL = 0
const NEWLINE = 0x0a

/**
 * What no text file can hold, so the sweep skips it rather than reporting it.
 *
 * An EXCLUSION and not a list of the extensions to read: a tracked binary of a type missing here
 * turns this guard RED, which says out loud that the list needs a line — where an inclusion list
 * would drop a whole new kind of text file in silence.
 */
const BINARY =
  /\.(png|webp|jpe?g|gif|ico|icns|mp4|mov|webm|mp3|wav|ogg|glb|fbx|npz|npy|p|ttf|otf|woff2?|wasm|zip|pdf)$/i

/**
 * 🛑 The one tracked file that is a BINARY wearing a text name: the physics engine the studio
 * compiles for itself inlines its WebAssembly into a JavaScript wrapper, raw bytes and all. Named
 * by PATH and not added to the pattern above — `.js` is the most reviewed extension there is, and
 * excusing all of it to excuse one artefact would be the silence this guard exists against.
 */
const VENDORED_ENGINE = 'vendor/jolt-physics/dist/jolt-physics.wasm-compat.js'

/**
 * Where a file carries the byte itself rather than an escape for it, as `path:line`.
 *
 * Bytes and not text: decoded as UTF-8 the byte becomes one character of the string, which no
 * longer tells it apart from the six characters that spell the escape.
 */
function nulSitesIn(path: string, bytes: Buffer): string[] {
  if (!bytes.includes(NUL)) return []

  const sites: string[] = []
  let line = 1
  for (const byte of bytes) {
    if (byte === NEWLINE) line += 1
    else if (byte === NUL) sites.push(`${path}:${line}`)
  }

  return sites
}

/** Everything git tracks but the binaries — its own list, so nothing ignored or untracked is read. */
const sweptFiles = (): string[] =>
  execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(
      path =>
        path && existsSync(join(ROOT, path)) && !BINARY.test(path) && path !== VENDORED_ENGINE,
    )

/**
 * A literal NUL makes git call the file BINARY, and a binary file is one nobody reviews.
 *
 * The byte is legitimate as a VALUE; what costs is spelling it raw instead of escaped, which
 * compiles to the very same string. Refused wherever it sits, and not only in the first 8 000
 * bytes git actually reads — a rule hanging on a byte offset holds until an unrelated edit.
 *
 * **Blind spot, written rather than discovered**: what git does not track is not read, and
 * `CLAUDE.md` — ignored — names the byte on purpose. Everything tracked and not binary is swept,
 * `.md`, `.json`, `.css`, `.sh` and the extensionless files included: the two defects this was
 * written for were TypeScript, but nothing about the symptom is.
 */
describe('no tracked file spells the NUL byte as the byte itself', () => {
  it(
    'holds every tracked file that is not a binary, wherever it sits in the repository',
    () => {
      expect(
        sweptFiles().flatMap(path => nulSitesIn(path, readFileSync(join(ROOT, path)))),
      ).toEqual([])
    },
    WHOLE_PROJECT,
  )

  /**
   * An empty result proves nothing unless the files were opened: pointed at a pattern nobody
   * writes, the assertion above stays green. Counted, and checked against the three kinds the
   * previous sweep could not see — outside `src/`, not TypeScript, and a suite.
   */
  it('sweeps the whole repository, not only the TypeScript of the four trees', () => {
    const swept = sweptFiles()

    expect(swept.length).toBeGreaterThan(1_500)
    expect(swept).toContain('vitest.config.ts')
    expect(swept).toContain('README.md')
    expect(swept.some(path => path.endsWith('.test.ts'))).toBe(true)
    expect(swept.some(path => path.endsWith('.json'))).toBe(true)
  })

  it('leaves the binaries git tracks out of the sweep', () => {
    expect(sweptFiles().some(path => BINARY.test(path))).toBe(false)
    expect(BINARY.test('build/icon.png')).toBe(true)
    expect(BINARY.test('src/shared/manual.json')).toBe(false)
  })

  /** And the one binary the pattern cannot name, which is tracked and does hold the byte. */
  it('leaves the vendored engine out, its bytes being a compiled module and not a source', () => {
    expect(sweptFiles()).not.toContain(VENDORED_ENGINE)
    expect(readFileSync(join(ROOT, VENDORED_ENGINE)).includes(NUL)).toBe(true)
  })

  it('names the line the byte sits on, and every line that carries one', () => {
    const nul = String.fromCodePoint(NUL)
    const source = `const a = 1\nconst b = '${nul}'\nconst c = '${nul}'`

    expect(nulSitesIn('probe.ts', Buffer.from(source))).toEqual(['probe.ts:2', 'probe.ts:3'])
  })

  it('leaves the escape that spells the same string alone', () => {
    expect(nulSitesIn('probe.ts', Buffer.from("const a = 'null\\u0000byte'"))).toEqual([])
  })
})
