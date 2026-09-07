import { describe, expect, it } from 'vitest'
import { stylesheet } from '../indexCss-fixtures'
import { WRITTEN_SOURCES } from './testHarness'

/**
 * The gauges JavaScript reads back, and what they are declared as.
 *
 * `useGauge` tests `endsWith('px')`, and an UNREGISTERED custom property computes to its own text
 * with variables substituted and nothing evaluated: `calc(168px * 1)` fails that test and falls to
 * the shipped number at every density and every font scale — in silence, and green under jsdom,
 * which evaluates no calc at all. `--sc-row-stacked` says the same thing in the stylesheet, and
 * says it as the reason it stayed flat.
 *
 * Its blind spot: a name composed at runtime is invisible here. Every call today writes a literal.
 */
const READ_BY_JS = /useGauge\(\s*'(--sc-[a-z-]+)'/g
const DERIVED = /(?:calc|var)\(/

const read = [
  ...new Set(
    WRITTEN_SOURCES.flatMap(([, source]) =>
      [...source.matchAll(READ_BY_JS)].map(match => match[1] ?? ''),
    ),
  ),
]

function declarationOf(name: string): string {
  return new RegExp(`${name}:\\s*([^;]+);`).exec(stylesheet)?.[1]?.trim() ?? ''
}

describe('a gauge read from JavaScript', () => {
  it('finds the calls at all, so the rule below cannot pass on an empty list', () => {
    expect(read.length).toBeGreaterThan(3)
  })

  it('is declared by the stylesheet', () => {
    expect(read.filter(name => declarationOf(name) === '')).toEqual([])
  })

  it('is registered with `@property` when it is derived, or it reads back as its own text', () => {
    const unregistered = read.filter(
      name =>
        DERIVED.test(declarationOf(name)) &&
        !new RegExp(`@property ${name}\\s*\\{`).test(stylesheet),
    )

    expect(unregistered).toEqual([])
  })
})
