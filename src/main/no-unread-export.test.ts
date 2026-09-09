import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PROJECT_TREES,
  SOURCE_ROOT,
  WHOLE_PROJECT,
  exportedNames,
  sourceFiles,
} from './sourceFiles'
import { testFilesUnder } from './wideGuards'

/**
 * No VALUE is published outside the main process without a reader.
 *
 * `pnpm unused:main` is knip, and the name IS its scope — `measure-tools.test.ts` records the five
 * configurations tried in vain to widen it. This reads the sources instead, the way the guards
 * next door do.
 *
 * **Values only, and not for want of symmetry.** A type unread is gone by compile time, and
 * deleting one is not always the fix: `UnaccountedPath` (`shared/domain/settingsRegistry.test.ts`)
 * is exported to nobody and read once, by the annotation that turns it into an assertion — a
 * setting described nowhere widens it past `never`, and that line stops compiling. Delete the case
 * instead and `noUnusedLocals` answers TS6196, measured 2026-09-08: it cannot be dropped in
 * silence. A value has no such property: unread, it ships and never runs.
 *
 * **What it does not see, in clear.** A value whose only reader is its own test PASSES — tests
 * count as readers, deliberately: **112** names are read by no production file, remeasured on
 * 2026-09-08 after knip 6.35 stopped counting `?raw` globs as imports, and none is read by no file
 * at all. "Tested but never called" is a real question and a different one. A name a registry
 * reaches by string passes too, the sweep matching identifiers, and every blind spot of
 * `exportedNames` is inherited.
 *
 * **The direction of the error is chosen**: it under-reports and never accuses wrongly. A name
 * appearing anywhere else — as a property, in a comment, inside a sentence — counts as read.
 */
const [, ...OUTSIDE_MAIN] = PROJECT_TREES

/**
 * Identifiers, not words: a longer name that merely CONTAINS a shorter one is not a use of it.
 * Never illustrate this with a name a module declares — the example would count as its reader.
 */
const IDENTIFIERS = /[A-Za-z_$][\w$]*/g

const occurrencesOf = (name: string, code: string): number =>
  (code.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length

describe('no unread value export', () => {
  it(
    'lets no tree outside the main process publish a value nothing reads',
    () => {
      const sources = new Map(
        testFilesUnder(SOURCE_ROOT, /\.tsx?$/).map(path => [path, readFileSync(path, 'utf8')]),
      )

      const filesHolding = new Map<string, number>()
      for (const text of sources.values())
        for (const word of new Set(text.match(IDENTIFIERS) ?? []))
          filesHolding.set(word, (filesHolding.get(word) ?? 0) + 1)

      const unread: string[] = []
      for (const tree of OUTSIDE_MAIN)
        for (const path of sourceFiles(tree)) {
          const text = sources.get(path) ?? ''
          for (const [name, kind] of exportedNames(text))
            // In one file, and once in it: the declaration itself, and nothing else anywhere.
            if (kind === 'value' && filesHolding.get(name) === 1 && occurrencesOf(name, text) <= 1)
              unread.push(`${relative(SOURCE_ROOT, path)}: ${name}`)
        }

      expect(unread.sort()).toEqual([])
    },
    WHOLE_PROJECT,
  )
})
