import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from '../../package.json'
import { RERUN_EVERYTHING, typecheckConfigsOf } from './rerunEverything'

const ROOT = join(import.meta.dirname, '..', '..')

describe('the short loop’s whole-suite trigger', () => {
  /**
   * A tsconfig absent from the list is not caught by `vitest related` either: the filter there is
   * `^src/`, so a `.json` under `config/` selects no test at all and `pnpm check` goes green
   * having run only the wide guards.
   */
  it('names every tsconfig the typecheck compiles under, bases included', () => {
    const compiled = typecheckConfigsOf(ROOT, manifest.scripts.typecheck)

    expect(compiled.length).toBeGreaterThan(0)
    expect(compiled.filter(path => !RERUN_EVERYTHING.includes(path))).toEqual([])
  })

  /** Both are legal TypeScript, and a base skipped here is a base nobody reruns the suite for. */
  it('follows an `extends` written as an array, package specifiers aside', () => {
    const root = mkdtempSync(join(tmpdir(), 'reruns-'))
    writeFileSync(join(root, 'base.json'), '{}')
    writeFileSync(
      join(root, 'one.json'),
      JSON.stringify({ extends: ['@tsconfig/node22/tsconfig.json', './base.json'] }),
    )

    expect(typecheckConfigsOf(root, 'tsc --noEmit -p one.json')).toEqual(['one.json', 'base.json'])
  })

  it('reads the long spelling of the project flag as well as the short one', () => {
    const root = mkdtempSync(join(tmpdir(), 'reruns-'))
    writeFileSync(join(root, 'one.json'), '{}')

    expect(typecheckConfigsOf(root, 'tsc --noEmit --project one.json')).toEqual(['one.json'])
  })

  it('is the list the short loop actually reads, not a copy of it', () => {
    expect(readFileSync(join(ROOT, 'scripts/check.mjs'), 'utf8')).toContain(
      "import { RERUN_EVERYTHING } from '../src/main/rerunEverything.ts'",
    )
  })
})
