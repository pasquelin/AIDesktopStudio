import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_ROOT = resolve(import.meta.dirname, '..')

const DECLARED = /^export (?:type|const|function|class|enum) (\w+)/gm
const STARRED = /^export \* from '(\.[\w./-]+)'/gm

function sourcesUnder(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) return sourcesUnder(path)
    return extname(entry.name) === '.ts' && !entry.name.includes('.test.') ? [path] : []
  })
}

const namesIn = (path: string): Set<string> =>
  new Set([...readFileSync(path, 'utf8').matchAll(DECLARED)].map(found => found[1] ?? ''))

/**
 * A module that re-exports another WHOLE and declares one of its names shadows it in silence:
 * the local declaration wins, both are offered to an auto-import, and no gate says a word. It is
 * how a stale `ReliefLayer` — the shape from before the edit layers — survived a file split.
 */
describe('a module that republishes another', () => {
  it('declares no name the republished module already declares', () => {
    const shadowed = sourcesUnder(SOURCE_ROOT).flatMap(path => {
      const source = readFileSync(path, 'utf8')
      const mine = namesIn(path)
      return [...source.matchAll(STARRED)].flatMap(found =>
        [...namesIn(resolve(path, '..', `${found[1]}.ts`))]
          .filter(name => mine.has(name))
          .map(name => `${path}: ${name}`),
      )
    })

    expect(shadowed).toEqual([])
  })
})
