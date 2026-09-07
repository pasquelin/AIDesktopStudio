import { describe, expect, it } from 'vitest'
import {
  CONTROL,
  FIELD,
  FIELD_FILL,
  NATIVE_SELECT,
  ROW_LINE,
  TITLE_BAR_GHOST,
  TITLE_BAR_TRIGGER,
  TOOLBAR_LABEL,
} from './styles'
import { rewrites, spellsOut, WRITTEN_SOURCES } from './testHarness'

/** The blind spot of `rewrites`: a site that never wore the constant leaves no call to read. */
const spellsOutRowLine = spellsOut(ROW_LINE.split(' '))

/**
 * The gauge and the room a NAMED control of the title bar takes, which the assistant's entry and
 * the account trigger had each written out before it existed. The pills beside them are not this
 * shape and keep their own `gap-2 px-3 py-1`: a pill is as wide as the space it stands for.
 */
const respacesTitleBar = rewrites('TITLE_BAR_GHOST', ['h-(--sc-control)', 'px-2'])

/**
 * The way a field was made to fill its line before it had a constant. Both words together and
 * never one, which is what `rewrites` gives: `min-w-0 flex-1` is the studio's commonest pair of
 * layout classes, worn by thirty-odd elements that are not fields at all, and either half on its
 * own is a caller dividing its own row rather than reaching for this shape.
 */
const refillsField = rewrites('FIELD', ['min-w-0', 'flex-1'])

/** The shape the four native pickers had before they were given a constant. */
const repadsControl = rewrites('CONTROL', ['px-1'])

/**
 * All three words are required, and `text-tiny` is what does the work: `text-muted … px-1` alone
 * is worn by the zoom readout of the image space, which is a BUTTON one clicks to return to
 * 100 % and not a word the bar sets down. A rule without it would call that a violation.
 */
const rewritesLabel = spellsOut(TOOLBAR_LABEL.split(' '))

/** As `WRITTEN_SOURCES` keys it: the glob resolves against `testHarness.ts`, its own neighbour. */
const GUARDED = ['./styles.ts', './panelStyles.ts']

describe('the word a bar sets beside its buttons', () => {
  it('carries the ink, the size and the room around it, and nothing else', () => {
    expect(TOOLBAR_LABEL.split(' ')).toEqual(['text-muted', 'text-tiny', 'px-1'])
  })

  it('is worn rather than written out again', () => {
    const offenders = WRITTEN_SOURCES.filter(
      ([path, source]) => !GUARDED.includes(path) && rewritesLabel(source),
    ).map(([path]) => path)

    expect(offenders).toEqual([])
  })

  it('reads the three in any order, since the formatter leaves the order alone', () => {
    expect(rewritesLabel('"text-muted text-tiny px-1"')).toBe(true)
    expect(rewritesLabel('"text-tiny text-muted px-1"')).toBe(true)
  })

  it('leaves alone what only shares two of the three, or a longer word that starts the same', () => {
    // The zoom readout of the image space, the manual's inline code, and the gauge a looser
    // substring rule would have read as `px-1`.
    expect(rewritesLabel('"text-muted w-auto px-1 tabular-nums"')).toBe(false)
    expect(rewritesLabel('"bg-base-300 text-tiny rounded px-1 py-0.5"')).toBe(false)
    expect(rewritesLabel('"text-muted text-tiny px-10"')).toBe(false)
  })

  // The partner of the rule above, and the same reason: a constant nobody wears is a dead export.
  it('is worn by the sites it was extracted from', () => {
    const wearing = WRITTEN_SOURCES.filter(
      ([path, source]) => !GUARDED.includes(path) && source.includes('TOOLBAR_LABEL'),
    )

    expect(wearing.length).toBeGreaterThanOrEqual(4)
  })
})
describe('the OS list wearing the control language', () => {
  it('is the control, plus the room around its text and nothing more', () => {
    expect(NATIVE_SELECT.split(' ')).toEqual([...CONTROL.split(' '), 'px-1'])
  })

  it('is worn rather than padded again at the call', () => {
    const offenders = WRITTEN_SOURCES.filter(
      ([path, source]) => !GUARDED.includes(path) && repadsControl(source),
    ).map(([path]) => path)

    expect(offenders).toEqual([])
  })

  it('leaves alone the callers whose own padding is not this one', () => {
    // The search field of `CollectionBar`, which pulls its left inset in for the magnifier, and
    // the colour swatch of the image space — both wear `CONTROL` and neither is a picker.
    expect(repadsControl("cn(CONTROL, 'w-full px-1')")).toBe(true)
    expect(repadsControl("cn(CONTROL, 'w-full py-0 pr-2 pl-7')")).toBe(false)
    expect(repadsControl("cn(CONTROL, 'w-(--sc-control) cursor-pointer border-none p-0.5')")).toBe(
      false,
    )
  })

  /**
   * It was extracted from four pickers and is now worn by ONE, which is the stronger rule: a
   * second wearer means a `<select>` was drawn by hand again instead of through `SelectField`,
   * and that is how twenty-one of them each read their own value back into their own union.
   */
  it('is worn by `SelectField`, and by nothing else', () => {
    const wearing = WRITTEN_SOURCES.filter(
      ([path, source]) => !GUARDED.includes(path) && source.includes('NATIVE_SELECT'),
    ).map(([path]) => path)

    expect(wearing).toEqual([expect.stringContaining('SelectField.tsx')])
  })
})

describe('the field that takes what its line has left', () => {
  it('is the field, plus the room it claims and nothing more', () => {
    expect(FIELD_FILL.split(' ')).toEqual([...FIELD.split(' '), 'min-w-0', 'flex-1'])
  })

  it('is worn rather than spread again at the call', () => {
    const offenders = WRITTEN_SOURCES.filter(
      ([path, source]) => !GUARDED.includes(path) && refillsField(source),
    ).map(([path]) => path)

    expect(offenders).toEqual([])
  })

  it('leaves alone the callers whose own width is not this one', () => {
    // The shape the four fields had before the constant, then the rename dialog's field — held
    // to the width of its box rather than to a share of a row — and a colour swatch, which is
    // square. Last, one half of the pair: a caller stopping an overflow it can see.
    expect(refillsField("cn(FIELD, 'text-tiny min-w-0 flex-1')")).toBe(true)
    expect(refillsField("cn(FIELD, 'w-full text-xs')")).toBe(false)
    expect(refillsField("cn(FIELD, 'px-1')")).toBe(false)
    expect(refillsField("cn(FIELD, 'min-w-0 truncate')")).toBe(false)
  })

  // The partner of the rule above: a constant nobody wears is a dead export.
  it('is worn by the four fields it was extracted from', () => {
    const wearing = WRITTEN_SOURCES.filter(
      ([path, source]) => !GUARDED.includes(path) && source.includes('FIELD_FILL'),
    )

    expect(wearing.length).toBeGreaterThanOrEqual(4)
  })
})

describe('the named control of a title bar', () => {
  it('is the ghost, plus the gauge and the room around its word', () => {
    expect(TITLE_BAR_TRIGGER.split(' ')).toEqual([
      ...TITLE_BAR_GHOST.split(' '),
      'text-tiny',
      'h-(--sc-control)',
      'gap-1.5',
      'px-2',
    ])
  })

  it('is worn rather than sized again at the call', () => {
    const offenders = WRITTEN_SOURCES.filter(
      ([path, source]) => !GUARDED.includes(path) && respacesTitleBar(source),
    ).map(([path]) => path)

    expect(offenders).toEqual([])
  })

  it('leaves alone the pills, whose room is their own', () => {
    expect(respacesTitleBar("cn(TITLE_BAR_GHOST, 'text-tiny h-(--sc-control) gap-1.5 px-2')")).toBe(
      true,
    )
    expect(respacesTitleBar("cn(TITLE_BAR_GHOST, 'gap-2 px-3 py-1')")).toBe(false)
  })

  /**
   * The partner of the rule above: a constant nobody wears is a dead export. ONE since 28 August,
   * where it was extracted from two — the assistant's entry left the title bar to become a panel
   * of the right column.
   */
  it('is worn by the control it was extracted for', () => {
    const wearing = WRITTEN_SOURCES.filter(
      ([path, source]) => !GUARDED.includes(path) && source.includes('TITLE_BAR_TRIGGER'),
    )

    expect(wearing.length).toBeGreaterThanOrEqual(1)
  })
})

describe('the shape of a row line', () => {
  it('is worn rather than written out again', () => {
    const offenders = WRITTEN_SOURCES.filter(
      ([path, source]) => !GUARDED.includes(path) && spellsOutRowLine(source),
    ).map(([path]) => path)

    expect(offenders).toEqual([])
  })

  // Named rather than counted: a count stays green when one site drops the constant and another
  // picks it up, and a fifth adopting it fails here ON PURPOSE. **Blind**: raw text, so `Row.tsx`
  // would still count on the comment that names the constant, with no `cn()` left.
  it('is worn by the four that draw a line', () => {
    const wearing = WRITTEN_SOURCES.filter(
      ([path, source]) => !GUARDED.includes(path) && /\bROW_LINE\b/.test(source),
    ).map(([path]) => path)

    expect(wearing.sort()).toEqual([
      '../features/material/components/StylesSection/StylesSectionRow.tsx',
      '../features/project/components/Project/ProjectRow.tsx',
      './Row.tsx',
      './TreeViewGap.tsx',
      './TreeViewRow.tsx',
    ])
  })
})
