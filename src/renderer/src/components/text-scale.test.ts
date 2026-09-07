import { describe, expect, it } from 'vitest'
import { stylesheet } from '../indexCss-fixtures'
import { cn } from '@/helpers/cn'
import { WRITTEN_SOURCES } from './testHarness'

/**
 * A size the studio writes has to come off the ladder, because the ladder is the only thing
 * `--sc-font-scale` reaches. An arbitrary pixel is frozen by definition, and so is any Tailwind
 * step the stylesheet has not re-valued: those are `rem`, and `rem` answers to the root element,
 * which nothing here sizes. That is how 95 of the 131 sized elements came to ignore the
 * preference for as long as it existed.
 *
 * What this cannot see: text PAINTED rather than laid out — `context.font` in the canvas and
 * timeline engines, a `fontSize` handed to a chart. Those are pixels in a string or a number,
 * not a class, and they read the tokens through `engines/core/palette.ts` or not at all.
 */
const OFF_LADDER = /text-\[\d+px\]|\btext-(?:xl|[2-9]xl)\b/

/**
 * A size handed to a chart or to a shape as a NUMBER. It becomes an attribute, and an attribute
 * reads no variable — `tick={{ fontSize: 10 }}` on the usage axis was frozen for that reason.
 * A size that comes from the document (`fontSize: layer.size`) is not a literal and not caught.
 */
const NUMERIC_SIZE = /\bfontSize:\s*\d/

/**
 * Line-height pairs are `--text-xs--line-height` and never match: a dash cannot follow the first
 * letter here. Digits do, so a step named `body2` is read rather than skipped — the merger rule
 * below is only as wide as this pattern, and a step it misses comes back frozen in silence.
 */
const LADDER = [...stylesheet.matchAll(/--text-([a-z][a-z0-9]*):\s*([^;]+);/g)]

const REGISTERED = [...stylesheet.matchAll(/@property --text-([a-z]+)\s*\{([^}]+)\}/g)]

describe('the text ladder of the studio', () => {
  it('finds the sources at all, so the rule below cannot pass on an empty list', () => {
    expect(WRITTEN_SOURCES.length).toBeGreaterThan(100)
  })

  it('re-values the Tailwind steps it keeps, rather than leaving them in rem', () => {
    expect(LADDER.map(([, name]) => name)).toEqual(
      expect.arrayContaining(['micro', 'mini', 'tiny', 'body', 'xs', 'sm', 'base', 'lg']),
    )
  })

  it('carries the scale on every step, so no step can be added frozen', () => {
    const frozen = LADDER.filter(([, , value = '']) => !value.includes('--sc-font-scale'))

    expect(frozen.map(([, name]) => name)).toEqual([])
  })

  /**
   * Unregistered, a custom property computes to its own text — a painter reading `--text-tiny`
   * would get `calc(11px * 1)` and hand the canvas a shorthand it drops whole, leaving the
   * previous font in place. Nothing on screen would say so.
   *
   * The `initial-value` is checked as strictly as the syntax because Chromium rejects the WHOLE
   * rule when the two disagree — `initial-value: 9` without its unit unregisters the step, and
   * puts the studio back where this lot found it without a single test turning red.
   */
  it('declares every step a length, so a painter reads a size and not a calc', () => {
    const registered = REGISTERED.map(([, name]) => name)
    const malformed = REGISTERED.filter(
      ([, , body = '']) =>
        !body.includes("syntax: '<length>'") ||
        !body.includes('inherits: true') ||
        !/initial-value:\s*\d+(?:\.\d+)?px\s*;/.test(body),
    )

    expect(registered).toEqual(expect.arrayContaining(LADDER.map(([, name]) => name)))
    expect(malformed.map(([, name]) => name)).toEqual([])
  })

  /**
   * `tailwind-merge` reads a font size by its t-shirt shape, so the steps Tailwind does not ship
   * looked like text COLOURS to it: `cn('text-muted', 'text-tiny')` returned the size alone, and
   * `CONTROL` had been handing out a `text-text` that never reached the DOM. Thirty call sites
   * were rendering a class they do not write; none was rendering one it does.
   *
   * Read off the sheet rather than listed, so a ninth step joins the rule by being declared —
   * `helpers/cn.ts` is where it has to be repeated, and this is what says so out loud.
   */
  it('lets a step and a colour survive each other in one call', () => {
    const eaten = LADDER.map(([, name]) => name).filter(
      step => cn('text-muted', `text-${step}`) !== `text-muted text-${step}`,
    )

    expect(eaten).toEqual([])
  })

  it('still lets one step replace another, and one colour replace another', () => {
    expect(cn('text-tiny', 'text-body')).toBe('text-body')
    expect(cn('text-muted', 'text-accent')).toBe('text-accent')
    // Alignment and wrapping share the prefix and none of the meaning.
    expect(cn('text-tiny', 'text-left')).toBe('text-tiny text-left')
  })

  /**
   * The cost of the step above: a font size now outranks `leading-*` for the merger, so a size
   * written AFTER an explicit line height silently takes it away. Every site writes them the
   * other way round today — this keeps it that way, because the loss shows nothing.
   *
   * One class list at a time: a run that crosses a quote or a newline is two attributes on two
   * elements, and the pairs a `cn()` builds across its arguments are checked by hand instead.
   */
  it('never hands the line height to a size that would eat it', () => {
    const offenders = WRITTEN_SOURCES.filter(([, source]) =>
      LADDER.some(([, step]) =>
        new RegExp(`leading-[a-z0-9-]+[^"'\\n]*\\btext-${step}\\b`).test(source),
      ),
    ).map(([path]) => path)

    expect(cn('leading-tight', 'text-tiny')).toBe('text-tiny')
    expect(offenders).toEqual([])
  })

  it('is the only way a source sizes text', () => {
    const offenders = WRITTEN_SOURCES.filter(([, source]) => OFF_LADDER.test(source)).map(
      ([path]) => path,
    )

    expect(offenders).toEqual([])
  })

  it('is the only way a source sizes a chart or a shape', () => {
    const offenders = WRITTEN_SOURCES.filter(([, source]) => NUMERIC_SIZE.test(source)).map(
      ([path]) => path,
    )

    expect(offenders).toEqual([])
  })
})
