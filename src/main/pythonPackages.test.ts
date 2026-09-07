import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import licences from '@shared/licences.json'
import {
  BUILD_ONLY_PYTHON,
  ENGINE_PACKAGE,
  INTERPRETER,
  UNREAD_ON_THIS_PLATFORM,
  UNREAD_PENDING_COLLECTION,
} from './pythonPackages'

const ROOT = join(import.meta.dirname, '..', '..')

const read = (name: string): string => readFileSync(join(ROOT, name), 'utf8')

/** What the lock pins, scanned the way the collector scans it — the blocks are two lines. */
function lockedPackages(): string[] {
  return read('engine/uv.lock')
    .split('\n')
    .flatMap(line => /^name = "(.+)"$/.exec(line.trim())?.[1] ?? [])
}

const pythonLicences = (): Record<string, { spdx: string | null }> =>
  JSON.parse(read('engine/licences.json'))

/**
 * The Python half of `shippedPackages.ts`, and it answers the same question: what reaches a
 * person, and under which licence. npm sees none of it, and `uv.lock` carries no licence at all
 * — measured on a 68-package lock.
 */
describe('what the Python side distributes', () => {
  /**
   * The case that goes red on its own. A package enters the lock through a dependency group, and
   * whoever adds it must say whether it reaches a person: the answer cannot be derived, and
   * deriving it would answer "build tool" by default for something that may well ship.
   */
  it('classifies every locked package', () => {
    const known = new Set([
      ...Object.keys(pythonLicences()),
      ...BUILD_ONLY_PYTHON,
      ...UNREAD_ON_THIS_PLATFORM,
      ...UNREAD_PENDING_COLLECTION,
      ENGINE_PACKAGE,
    ])

    expect(lockedPackages().filter(name => !known.has(name))).toEqual([])
  })

  /**
   * The list only shrinks when the collector is taught to install every extra; until then a
   * growing one is a growing hole, and a silent one is worse.
   */
  it('does not let the uncollected half grow unnoticed', () => {
    const locked = new Set(lockedPackages())

    expect(UNREAD_PENDING_COLLECTION.filter(name => !locked.has(name))).toEqual([])
    expect(UNREAD_PENDING_COLLECTION).toHaveLength(81)
  })

  it('states a licence for each package whose metadata was read', () => {
    const unread = Object.entries(pythonLicences())
      .filter(([, entry]) => !entry.spdx)
      .map(([name]) => name)

    expect(unread).toEqual([])
  })

  it('gives each distributed package its line in the collected notices', () => {
    const noticed = new Set(licences.map(entry => entry.name))
    const distributed = Object.keys(pythonLicences()).filter(
      name => !BUILD_ONLY_PYTHON.includes(name) && name !== ENGINE_PACKAGE,
    )

    for (const name of [INTERPRETER.name, ...distributed]) {
      expect(noticed.has(name), `${name} has no notice`).toBe(true)
    }
  })

  /**
   * 🛑 The hole, held rather than described: the CUDA stack is locked, ships on Linux, and its
   * licences have never been read — no such environment materialises on this machine. This case
   * is what stops the list from quietly growing, and it goes red the day someone reads them.
   */
  it('holds the size of what has never been read on this platform', () => {
    expect(UNREAD_ON_THIS_PLATFORM).toHaveLength(19)
    expect(UNREAD_ON_THIS_PLATFORM.every(name => lockedPackages().includes(name))).toBe(true)
  })
})
