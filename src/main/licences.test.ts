import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import licences from '@shared/licences.json'
import { isCopyleft, type Licence, NO_VERSION } from '@shared/domain/licence'
import manifest from '../../package.json'
import { BUILD_ONLY, SHIPPED } from './shippedPackages'
import { SOURCE_ROOT } from './sourceFiles'
import { testFilesUnder } from './wideGuards'

// Under `src/main` because `src/shared` compiles for the renderer, where `node:fs` has no types.
const ROOT = join(import.meta.dirname, '..', '..')
const entries: Licence[] = licences

const notices = readFileSync(join(ROOT, 'THIRD-PARTY-NOTICES.md'), 'utf8')
const licence = readFileSync(join(ROOT, 'LICENSE'), 'utf8')
const eula = readFileSync(join(ROOT, 'EULA.md'), 'utf8')
const gameLicence = readFileSync(join(ROOT, 'src', 'game', 'LICENSE'), 'utf8')

describe('the notice the repository carries', () => {
  it('embeds the complete local motion terms and required attribution offline', () => {
    const snapshots = [
      ['Kimodo code', 'kimodo-apache'],
      ['Kimodo SOMA weights', 'nvidia-open-model'],
      ['Meta Llama 3', 'meta-llama3'],
      ['Meta Llama 3', 'meta-llama3-use-policy'],
      ['LLM2Vec motion encoder adapters', 'llm2vec-mit'],
    ]
    for (const [name, file] of snapshots) {
      const fullText = readFileSync(join(ROOT, 'scripts', 'licence-texts', `${file}.txt`), 'utf8')
      expect(fullText.length).toBeGreaterThan(1000)
      expect(entries.find(entry => entry.name === name)?.text).toContain(fullText)
      expect(notices).toContain(fullText.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, ''))
    }
    expect(entries.find(entry => entry.name === 'Meta Llama 3')?.attribution).toBe(
      'Built with Meta Llama 3',
    )
  })

  // A stale copy would credit the wrong versions to whoever reads the repository, not the app.
  it('mirrors every entry of the window, version and licence included', () => {
    for (const entry of entries) {
      expect(notices, `${entry.name} is missing from THIRD-PARTY-NOTICES.md`).toContain(
        `## ${entry.name}\n`,
      )
      // A typeface carries no version of its own; the file says so in words rather than leaving
      // the column empty — and never `undefined`, which is what a missing field used to print.
      expect(notices).toContain(
        `| ${entry.name} | ${entry.version ?? NO_VERSION} | ${entry.spdx} |`,
      )
    }
  })

  // The offer is the whole point of the file for these two: attribution alone would not do.
  it('carries the source offer of every copyleft component', () => {
    const copyleft = entries.filter(entry => isCopyleft(entry.spdx))
    expect(copyleft.length).toBeGreaterThan(0)

    for (const entry of copyleft) {
      expect(notices, `${entry.name} lost its source offer`).toContain(entry.sources ?? '')
    }
  })
})

/**
 * `SHIPPED` is spelled out by hand, and nothing confronts it with the manifest: a package dropped
 * from `package.json` stays listed, and the notice goes on naming a component the binary no longer
 * carries. `licence.test.ts` holds the other half of the same accounting — declared, hence shipped
 * or a build tool — and neither half sees a name that left the manifest.
 *
 * What is still uncovered: a name removed from `SHIPPED` without regenerating leaves its entry in
 * the notice, and every case here passes on a superset.
 */
describe('the list the collector ships from', () => {
  it('names only packages the manifest still declares', () => {
    const declared = new Set([
      ...Object.keys(manifest.dependencies),
      ...Object.keys(manifest.devDependencies),
    ])
    expect(SHIPPED.filter(name => !declared.has(name))).toEqual([])
  })

  // Adding a name without regenerating leaves the window announcing less than the binary ships.
  it('has an entry in the notice for each of its names', () => {
    const named = new Set(entries.map(entry => entry.name))
    expect(SHIPPED.filter(name => !named.has(name))).toEqual([])
  })

  /**
   * Every declared dependency is either shipped — hence in the notice — or a tool that never
   * leaves the machine that built it. A new one is neither until someone says which, and this is
   * what asks: reading `dependencies` alone would miss the twenty packages Vite bundles out of
   * `devDependencies`, which is most of what the notice owes.
   *
   * It moved here from `shared/domain/licence.test.ts` on 2026-08-16, and it brought the second
   * list with it: the two halves were written in different folders, so a package added to the
   * manifest was classified by whoever saw the half they happened to open.
   */
  it('accounts for every declared dependency, as shipped or as a build tool', () => {
    const declared = [
      ...Object.keys(manifest.dependencies),
      ...Object.keys(manifest.devDependencies),
    ]
    expect(declared.length).toBeGreaterThan(20)

    const classified = new Set([...SHIPPED, ...BUILD_ONLY])
    expect(declared.filter(name => !classified.has(name))).toEqual([])
  })

  /** A name in both halves is a decision taken twice, which is what the split invites. */
  it('puts no package on both sides of the line', () => {
    const shipped = new Set(SHIPPED)

    expect(BUILD_ONLY.filter(name => shipped.has(name))).toEqual([])
  })
})

// Three texts, three scopes; confusing them is the mistake worth guarding against.
describe('the terms the project ships under', () => {
  it('declares in the manifest the licence the repository actually carries', () => {
    expect(manifest.license).toBe('PolyForm-Noncommercial-1.0.0')
    expect(licence).toContain('# PolyForm Noncommercial License 1.0.0')
    expect(licence).toContain('Required Notice: Copyright 2026 Alban Pasquelin')
  })

  it('keeps the repository licence clear of what it does not cover', () => {
    expect(licence).toContain('THIRD-PARTY-NOTICES.md')
    expect(licence).toContain('EULA.md')
  })

  /**
   * The one carve-out, and it is load-bearing: a game exported from this studio ships the runtime
   * of `src/game`, so that runtime is MIT and the game is its author's to sell. Nothing else
   * would notice the day the sentence, or the file it names, went away.
   */
  it('publishes the game runtime under terms an author can sell a game under', () => {
    expect(licence).toContain('`src/game/` is published under the MIT License')
    expect(gameLicence).toContain('MIT License')
    expect(gameLicence).toContain('Copyright (c) 2026 Alban Pasquelin')
  })

  /**
   * The mark on each file rather than on the folder alone: a file COPIED out of the tree carries
   * its terms with it, and one added to the tree without them is what this notices.
   */
  it('marks every file of the game runtime with those terms', () => {
    const unmarked = testFilesUnder(join(SOURCE_ROOT, 'game'), /\.tsx?$/).filter(
      file => !readFileSync(file, 'utf8').startsWith('// SPDX-License-Identifier: MIT'),
    )

    expect(unmarked.map(file => relative(SOURCE_ROOT, file))).toEqual([])
  })

  it('governs the binary by its own terms, which name the FFmpeg offer', () => {
    expect(eula).toContain('THIRD-PARTY-NOTICES.md')
    // The one obligation the terms of use must not read as narrowing.
    expect(eula).toContain('FFmpeg')
  })

  /**
   * electron-builder has no root `license` key: declaring one fails `validateConfiguration`
   * before any platform is packaged, so the mistake costs a whole release rather than one target.
   * Matched on the text — the schema lives in a dev dependency this project must not import.
   */
  it('offers the terms of use from where electron-builder accepts them', () => {
    const packaging = readFileSync(join(ROOT, 'electron-builder.yml'), 'utf8')

    expect(packaging).not.toMatch(/^license:/m)
    expect(packaging).toMatch(/^ {2}license: EULA\.md$/m)
  })
})
