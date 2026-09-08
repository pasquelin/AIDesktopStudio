import { describe, expect, it } from 'vitest'
import { ROW_LINE, TITLE_BAR_GHOST, TITLE_BAR_TRIGGER, TOOLBAR_LABEL } from './styles'
import { withoutComments } from './sourceText'
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
describe('a list one picks from', () => {
  /**
   * The rule the four skins were replaced by: a `<select>` is written ONCE, in `Select`, and
   * every other surface asks for that component. Four pickers had each drawn their own, which is
   * how the studio came to hold a bordered one, a borderless one, the browser's chevron and
   * daisyUI's triangles at the same time.
   *
   * 🛑 Blind spot: it reads the TAG, so a copy built through `createElement('select')` or a
   * daisyUI `.select` written on a `<div>` stays green. Neither exists today.
   */
  it('is drawn by `Select` and by nothing else', () => {
    const drawing = WRITTEN_SOURCES.filter(
      ([path, source]) => !GUARDED.includes(path) && /<select[\s/>]/.test(withoutComments(source)),
    ).map(([path]) => path)

    expect(drawing).toEqual([expect.stringContaining('/Select.tsx')])
  })
})

describe('a control that goes straight to the platform', () => {
  /**
   * The tag itself, and everything allowed to open it. `Input`, `Checkbox`, `Toggle` and
   * `SliderHandle` are the four that DRESS one; the rest of the list is what has not been given
   * a component yet, written out rather than waved through:
   *
   * - the four colour swatches, which are a batch of their own;
   * - the single radio of the AI settings, alone and therefore not yet a shape;
   * - `AssetDropField`'s hidden field and the comment's own bare title, which are plumbing;
   * - the shortcut fixtures, which render a field to be typed into by a test.
   *
   * 🛑 It reads the TAG: a control built through `createElement('input')` stays green.
   */
  it('is opened by the components that dress one, and by the list below', () => {
    const opening = WRITTEN_SOURCES.filter(
      ([path, source]) => !GUARDED.includes(path) && /<input[\s/>]/.test(withoutComments(source)),
    )
      .map(([path]) => path)
      .sort()

    expect(opening).toEqual(
      [
        './AssetDropField.tsx',
        './Checkbox.tsx',
        './ColorField.tsx',
        './DynamicForm/DynamicFormControl.tsx',
        './Input.tsx',
        './SliderHandle.tsx',
        './Toggle.tsx',
        '../features/image/components/ImageDocument/ImageDocumentBrush.tsx',
        '../features/image/components/ImageDocument/ImageDocumentComment.tsx',
        '../features/settings/components/Ai/AiChoiceRow.tsx',
        '../features/settings/components/Setting/Row/SettingRowColorControl.tsx',
        '../hooks/shortcuts-fixtures.tsx',
      ].sort(),
    )
  })
})

describe('a box one ticks', () => {
  /**
   * The same rule for the other native control the studio kept redrawing: six sites wrote
   * `type="checkbox"` with a size of their own, in two gauges, and a seventh reached for the
   * plugin's class directly. `Checkbox` holds the value one FILLS IN, `Toggle` the setting that
   * takes effect where it stands — and nothing else opens the tag.
   */
  it('is drawn by `Checkbox` and `Toggle`, and by nothing else', () => {
    const drawing = WRITTEN_SOURCES.filter(
      ([path, source]) =>
        !GUARDED.includes(path) && /type="checkbox"/.test(withoutComments(source)),
    )
      .map(([path]) => path)
      .sort()

    expect(drawing).toEqual([
      expect.stringContaining('/Checkbox.tsx'),
      expect.stringContaining('/Toggle.tsx'),
    ])
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
      './TreeViewRow.tsx',
    ])
  })
})
