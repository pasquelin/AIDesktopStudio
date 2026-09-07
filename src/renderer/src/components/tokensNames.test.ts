import { describe, expect, it } from 'vitest'
import { stylesheet } from '../indexCss-fixtures'
import { WRITTEN_SOURCES } from './testHarness'

/** The `bg-…` utilities Tailwind builds from something other than a colour. */
const BUILT_IN_BACKGROUNDS =
  /^(transparent|current|inherit|none|black|white|auto|cover|contain|fixed|local|scroll|top|bottom|left|right|center|no-repeat|(top|bottom)-(left|right)|(clip|origin|blend|gradient|linear|radial|conic|repeat)(-.*)?)$/

/**
 * Tailwind 4 builds `text-<name>` from BOTH the font-size scale and the colour tokens, and the
 * colour wins. A token named after a size therefore repaints text instead of sizing it — the
 * `base` token did exactly that, painting titles in the panel background they sat on.
 *
 * Tailwind's own steps, plus the studio ladder read from the stylesheet: the ladder is where a
 * collision would land today, since it is what the studio actually writes.
 */
const BUILT_IN_TEXT_SIZE_NAMES = [
  'xs',
  'sm',
  'base',
  'lg',
  'xl',
  '2xl',
  '3xl',
  '4xl',
  '5xl',
  '6xl',
  '7xl',
  '8xl',
  '9xl',
]

/**
 * `--radius-sc-*` sits in `@theme`, so Tailwind builds `rounded-sc-lg` from it — but the gauges
 * sit in `:root`, where it builds nothing at all and `h-sc-control` would paint nothing without
 * a word from anyone. One spelling for both leaves that trap no entrance.
 *
 * Any prefix rather than a list of them: a misspelt gauge is the deadly case, and a list holds
 * only the prefixes written the day it was typed — `size` and `shadow` were already missing from
 * it. The lookbehind is what spares the correct form, whose `radius-sc-lg` follows a dash.
 *
 * **Blind**: a class assembled at runtime, the name arriving from a variable. And it reads raw
 * text, so a production module that merely NAMES `rounded-sc-lg` — a comment, an import path —
 * fails the rule while painting nothing wrong.
 */
const GENERATED_FROM_A_STUDIO_TOKEN = /(?<![\w-])[a-z][a-z0-9-]*-sc-[a-z0-9-]+/g

/**
 * 🛑 A fill naming a token that does not exist paints NOTHING, and nothing goes red for it.
 *
 * Tailwind 4 builds `bg-<name>` from the colour tokens; asked for a name none of them carries, it
 * builds no class at all and the element simply keeps whatever is behind it. `CharacterWindow`
 * wore `bg-chrome` — there has never been a `--color-chrome` — and read as grey only because the
 * native window it sat in happened to be painted the chassis. Every gate was green on it, this
 * suite included: the ratios above measure DECLARED tokens against each other and never look at
 * what a component actually spells.
 *
 * **Blind**: a class assembled at runtime, and the `text-`/`border-` families, whose names collide
 * with the size and width scales — the ground is where the defect was and where it costs most.
 */
function unknownFills(sources: readonly (readonly [string, string])[]): string[] {
  const declared = declaredColorNames()

  return [
    ...new Set(
      sources.flatMap(([path, source]) =>
        [...source.matchAll(/\bbg-([a-z][a-z0-9-]*)/g)]
          .flatMap(([, name]) => name ?? [])
          .filter(name => !declared.includes(name) && !BUILT_IN_BACKGROUNDS.test(name))
          .map(name => `${path} bg-${name}`),
      ),
    ),
  ].sort()
}

/**
 * Whole-sheet rather than block by block: a list of blocks goes quiet the day a third one is
 * written, and the rule below would then refuse a name that resolves perfectly. **Blind**: a token
 * declared in one theme alone counts as declared, and paints nothing in the other.
 */
const declaredColorNames = (): string[] => colorNamesIn(stylesheet)

function textSizeNames(): string[] {
  const ladder = [...themeBlock().matchAll(/--text-([a-z0-9-]+)\s*:/g)].flatMap(
    ([, name]) => name ?? [],
  )

  return [...BUILT_IN_TEXT_SIZE_NAMES, ...ladder]
}

/** The colour names one stretch of the stylesheet declares — a block, or the whole sheet. */
function colorNamesIn(css: string): string[] {
  return [...css.matchAll(/--color-([a-z0-9-]+)\s*:/g)].flatMap(([, name]) => name ?? [])
}

function themeBlock(): string {
  const [theme = ''] = stylesheet.slice(stylesheet.indexOf('@theme {')).split('\n}')

  return theme
}

describe('the indentation gauge', () => {
  it('derives from the gutter rather than repeating a length', () => {
    expect(stylesheet).toContain('--sc-indent: calc(var(--sc-gutter) * 2);')
  })

  it('is declared once, so density reaches it through the gutter', () => {
    expect(stylesheet.match(/--sc-indent\s*:/g)).toHaveLength(1)
  })
})
describe('the tooltip measure', () => {
  it('is a gauge the host actually reads', () => {
    const host = WRITTEN_SOURCES.find(([path]) => path.endsWith('/TooltipHost.tsx'))

    expect(stylesheet).toMatch(/--sc-tooltip:\s*\d+ch;/)
    expect(host?.[1]).toContain('max-w-(--sc-tooltip)')
  })
})

describe('color tokens', () => {
  it('are found at all, so the rule below cannot pass on an empty list', () => {
    expect(colorNamesIn(themeBlock())).toContain('panel')
  })

  it('never take a name from a font-size scale', () => {
    const sizes = textSizeNames()

    expect(sizes).toContain('tiny')
    expect(colorNamesIn(themeBlock()).filter(name => sizes.includes(name))).toEqual([])
  })
})

describe('a fill naming a colour', () => {
  it('finds the tokens at all, so the rule below cannot pass on an empty list', () => {
    expect(declaredColorNames()).toContain('chassis')
    expect(declaredColorNames()).toContain('base-200')
  })

  it('names one the stylesheet declares, or Tailwind builds no class at all', () => {
    expect(unknownFills(WRITTEN_SOURCES)).toEqual([])
  })

  /** The exact state the repository shipped in until 2026-09-03, beside the form that resolves. */
  it('tells a declared token from an invented one, which is what makes it a rule', () => {
    expect(unknownFills([['./probe.tsx', '"bg-chrome flex"']])).toEqual(['./probe.tsx bg-chrome'])
    expect(unknownFills([['./probe.tsx', '"flex bg-chassis"']])).toEqual([])
  })
})

describe('a studio token written into a class', () => {
  it('finds the sources at all, so the rule below cannot pass on an empty list', () => {
    expect(WRITTEN_SOURCES.length).toBeGreaterThan(100)
  })

  it('is read through its variable, never through a utility Tailwind may not have built', () => {
    const generated = WRITTEN_SOURCES.flatMap(([path, source]) =>
      [...source.matchAll(GENERATED_FROM_A_STUDIO_TOKEN)].map(([written]) => `${path} ${written}`),
    )

    expect(generated).toEqual([])
  })

  it('matches at all, so the rule above cannot pass on a dead pattern', () => {
    expect('rounded-sc-lg h-sc-control'.match(GENERATED_FROM_A_STUDIO_TOKEN)).toEqual([
      'rounded-sc-lg',
      'h-sc-control',
    ])
  })
})
