import { describe, expect, it } from 'vitest'
import { FIELD_LABEL, FIELD_ROW, SLIDER_HANDLE } from './styles'
import { spellsOut, WRITTEN_SOURCES } from './testHarness'
import { stylesheet } from '../indexCss-fixtures'
import toolButton from './ToolButton.tsx?raw'

/** Comments stripped: four rules of the guard this replaced were matching their own prose. */
const stripped = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/**
 * The one file that may hold a `<input type="range">`, and the rule is about the RAIL: the studio
 * drew three of them — a native track, a hand-made one and daisyUI's — before this list existed,
 * and each was written by a site reaching for the input on its own. A fourth would arrive the same
 * way and pass every other guard, each of them reading tokens it wears properly.
 *
 * It named two until `SliderHandle` was pulled out of them: `Slider` and `RangeField` now compose
 * it, and a range input is written in exactly one place.
 */
const SLIDER_OWNERS = ['./SliderHandle.tsx']

/** The set, in one string: a site that never wore the constant leaves no call to read. */
const spellsOutHandle = spellsOut(SLIDER_HANDLE.split(' '))

/** As `WRITTEN_SOURCES` keys it: the glob resolves against `testHarness.ts`, its own neighbour. */
const GUARDED = ['./styles.ts', './panelStyles.ts']

describe('the slider of the studio', () => {
  it('is the only kind of input allowed to be a range', () => {
    const offenders = WRITTEN_SOURCES.filter(
      ([path, source]) => !SLIDER_OWNERS.includes(path) && source.includes('type="range"'),
    ).map(([path]) => path)

    expect(offenders).toEqual([])
  })

  it('is written by the one that owns it, so the rule cannot pass on a studio without sliders', () => {
    const owners = WRITTEN_SOURCES.filter(([, source]) => source.includes('type="range"')).map(
      ([path]) => path,
    )

    expect(owners.sort()).toEqual(SLIDER_OWNERS)
  })

  /** Named rather than counted. **Blind**: raw text, so a mention in a comment reads as a wearer. */
  it('is worn by the three it was extracted from', () => {
    const wearing = WRITTEN_SOURCES.filter(([, source]) => /\bSliderHandle\b/.test(source))
      .map(([path]) => path)
      .filter(path => !SLIDER_OWNERS.includes(path))

    expect(wearing.sort()).toEqual(['./RangeField.tsx', './Slider.tsx'])
  })

  it('wears the shared handle rather than writing it out again', () => {
    const offenders = WRITTEN_SOURCES.filter(
      ([path, source]) => !GUARDED.includes(path) && spellsOutHandle(source),
    ).map(([path]) => path)

    expect(offenders).toEqual([])
  })

  it('leaves alone an input that merely covers its host', () => {
    expect(spellsOutHandle("'absolute inset-0 m-0 size-full'")).toBe(false)
  })
})
describe('the header glyph', () => {
  it('is the same number in the sheet as in the button', () => {
    const gauge = /--sc-icon-header:\s*(\d+)px/.exec(stylesheet)?.[1]
    const host = /header:\s*\{[^}]*glyph:\s*(\d+)/.exec(toolButton)?.[1]

    expect(gauge).toBeDefined()
    expect(host).toBe(gauge)
  })
})

describe('the column a property line begins on', () => {
  /**
   * Capped and NOT floored, which is not an oversight: a floor cannot shrink, and a side zone
   * dragged to its 140px minimum then overflowed by 21px — the control collapsing to nothing while
   * the buttons sat outside the panel.
   */
  it('takes a share of the row that a narrow panel can still shrink', () => {
    expect(FIELD_LABEL).toContain('w-(--sc-label-share)')
    expect(FIELD_LABEL).toContain('max-w-(--sc-label-max)')
    expect(FIELD_LABEL).not.toContain('min-w-(--sc-label')
  })

  /** The lookbehind keeps `min-w-0` out of it: a minimum of zero is not a column width. */
  it('is never a hardcoded width', () => {
    expect(FIELD_LABEL).not.toMatch(/(?<![\w-])w-\d/)
  })

  /**
   * The inset belongs to whatever HOLDS the row, which is what makes the two families line up: a
   * row carrying its own started where no field could follow it.
   */
  it('leaves the horizontal inset to whatever holds the row', () => {
    expect(FIELD_ROW).not.toMatch(/\bpx-\d/)
  })

  /** Same height too, or two lines of the same list are not the same height. */
  it('stands the height of a control', () => {
    expect(FIELD_ROW).toContain('min-h-(--sc-control)')
  })

  /**
   * Nine files each had to remember the end column, and eight spelt the label column out. The
   * rule making a truncated name readable was fixed on ONE of them — `ToggleField`, seen cut
   * mid-word — and the others went on truncating. Two files write these now, and the sweep asks
   * the only question left: that nothing goes around them. Comments stripped, since both names
   * appear in prose right here.
   */
  const writersOf = (token: string): (string | undefined)[] =>
    WRITTEN_SOURCES.filter(([, source]) => stripped(source).includes(token))
      .map(([path]) => path.split('/').pop())
      .sort()

  it('is written by the shell alone, so no line can end where it pleases', () => {
    expect(writersOf('FIELD_ROW')).toEqual(['PropertyLine.tsx', 'panelStyles.ts'])
  })

  it('is drawn by one component alone, so no field can spell the column out again', () => {
    expect(writersOf('FIELD_LABEL')).toEqual(['PropertyLabel.tsx', 'panelStyles.ts'])
  })
})
