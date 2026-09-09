import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GATE } from './gateLinks'

const ROOT = join(import.meta.dirname, '..', '..')

/**
 * Read as steps, not as text: a commented-out `# - run: …` still holds the words. Both idioms
 * count — `- run: x` and the `run: x` that sits under a `- name:`, which `release.yml` already
 * uses and which a first version of this guard was blind to.
 *
 * **Blind spot, and it is real**: a `run: |` block puts its commands on the lines below, which
 * nothing here reads. `release.yml` uses that form too. A link of the gate hidden in such a block
 * would pass this guard.
 */
const runSteps = (): string[] =>
  readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('run:') || line.startsWith('- run:'))
    .map(line => line.replace(/^(- )?run:/, '').trim())
    .filter(Boolean)

describe('the integration job running the gate and nothing beside it', () => {
  /**
   * What the job MAY run, not a list of what it may not: enumerating the links by hand let a
   * fifth link pass unguarded, and naming them as forbidden let `pnpm exec electron-vite build`
   * sit beside the `pnpm build` link until 2026-09-08 — one whole artefact rebuilt per CI run.
   */
  it('runs the gate and the install it needs, and nothing else', () => {
    expect(runSteps()).toEqual(['pnpm install --frozen-lockfile', 'pnpm validate'])
  })
})

/**
 * `pnpm typecheck` → `typecheck`, escaped: a link named `test:e2e(fast)` would break the regex.
 *
 * Read from `gateLinks.ts`, which is where the chain moved on 2026-09-08: `validate` used to spell
 * its links with `&&` and now calls `scripts/gate.mjs`, which runs them from that array. Splitting
 * the script would leave this guard with one pattern and the doc check below could never reach the
 * three it needs — green, and blind.
 */
const linkPatterns = (): string[] =>
  GATE.map(link => link.command.replace(/^pnpm\s+/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

/**
 * Tracked markdown, asked of git rather than walked: `CLAUDE.md` sits at the root, is ignored, and
 * copies the gate on purpose. The price runs the other way — a `.md` written and not yet staged
 * escapes this guard until it is added.
 */
const trackedDocs = (): string[] =>
  execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)

/**
 * Bounded on both sides, `:` and `-` kept out of the boundary so `format:check` stays whole.
 * Compiled once: rebuilding them per line cost 191 ms over the 34 608 lines of tracked markdown,
 * against 25 ms hoisted — measured 2026-09-08, same verdict.
 */
const LINK_BOUNDS = linkPatterns().map(pattern => new RegExp(`(^|[^\\w:-])${pattern}([^\\w:-]|$)`))

/**
 * Three names on one LINE, not two: `lint` and `test` meet in ordinary prose — measured on the
 * 2026-08-18 tree, two flag a step reading "replay the guard and the typecheck", three flag the
 * enumerations and nothing else. Two blind spots follow: an enumeration spread over several lines,
 * one link per bullet, and a link named in French — "vérification de format".
 */
const copiesTheGate = (line: string): boolean =>
  LINK_BOUNDS.filter(bounded => bounded.test(line)).length >= 3

describe('the documents naming the gate rather than copying its links', () => {
  /**
   * Commit `8d079bda`, 2026-08-17, corrected four such enumerations by hand — two in `README.md`,
   * one in each `architecture.md` — the day a fifth link was added. Decision records are out: an
   * ADR body states what the gate was at its date, and holding that still is the point of the form.
   */
  it('spells out no enumeration of the gate outside a decision record', () => {
    const copies = trackedDocs()
      .filter(path => !path.startsWith('docs/ci/adr/'))
      .flatMap(path =>
        readFileSync(join(ROOT, path), 'utf8')
          .split('\n')
          .flatMap((line, index) => (copiesTheGate(line) ? [`${path}:${index + 1}`] : [])),
      )

    expect(copies).toEqual([])
  })
})
