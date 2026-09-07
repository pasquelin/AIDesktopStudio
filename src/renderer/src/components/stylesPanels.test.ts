import { describe, expect, it } from 'vitest'
import {
  COLOR_READOUT,
  PANEL_BAR,
  PANEL_GROUP_LABEL,
  PANEL_GROUP_LABEL_WIDE,
  PANEL_HEAD,
  ROW_SUBJECT,
} from './styles'
import { rewrites, spellsOut, WRITTEN_SOURCES } from './testHarness'

/**
 * The whole set, which is what leaves the activity list's own bar alone: it rules off the same
 * way with a tighter gap, and a rule reading four of these five words would move it by 2px.
 */
const spellsOutPanelBar = spellsOut(PANEL_BAR.split(' '))

/**
 * The whole set: the two windows that stack a column the same way rule it off in DaisyUI ink
 * (`border-base-300`), which is the other side of a border this file has no say over.
 */
const spellsOutPanelHead = spellsOut(PANEL_HEAD.split(' '))

/**
 * All five words or none: the hexadecimal `ColorField` writes beside its swatch is the same shape
 * one ink away — four of these words plus `text-muted` — and telling it off would be telling off
 * the wrong thing.
 */
const spellsOutSubject = spellsOut(ROW_SUBJECT.split(' '))

/** The three the wide one adds to claim its line, required together or not at all. */
const widensGroupLabel = rewrites('PANEL_GROUP_LABEL', ['min-w-0', 'flex-1', 'truncate'])

/**
 * All four words or none: `text-muted` with `uppercase` is also a caption that titles nothing.
 * The two group titles of the SETTINGS windows sit one word away, on `text-base-content/70` —
 * DaisyUI ink, and a window harmonised towards `text-muted` would be told off by this wrongly.
 */
const spellsOutGroupLabel = spellsOut(PANEL_GROUP_LABEL.split(' '))

/** As `WRITTEN_SOURCES` keys it: the glob resolves against `testHarness.ts`, its own neighbour. */
const GUARDED = ['./styles.ts', './panelStyles.ts']

describe('the word that names a group in a panel', () => {
  it('is the label, plus what a wide one claims of its line and nothing more', () => {
    expect(PANEL_GROUP_LABEL_WIDE.split(' ')).toEqual([
      ...PANEL_GROUP_LABEL.split(' '),
      'min-w-0',
      'flex-1',
      'truncate',
      'font-medium',
    ])
  })

  it('is worn rather than written out again', () => {
    const offenders = WRITTEN_SOURCES.filter(
      ([path, source]) => !GUARDED.includes(path) && spellsOutGroupLabel(source),
    ).map(([path]) => path)

    expect(offenders).toEqual([])
  })

  it('is worn rather than widened again at the call', () => {
    const offenders = WRITTEN_SOURCES.filter(
      ([path, source]) => !GUARDED.includes(path) && widensGroupLabel(source),
    ).map(([path]) => path)

    expect(offenders).toEqual([])
  })

  // Named rather than counted, and `DiffImages` wears it twice — the two sides of a comparison.
  // **Blind**: raw text, so a file naming the constant in a comment alone would still count.
  // A name is added here by REVIEW: the point is that nothing wears a group label without one.
  it('is worn by the files a review named', () => {
    const wearing = WRITTEN_SOURCES.filter(
      ([path, source]) => !GUARDED.includes(path) && /\bPANEL_GROUP_LABEL(?:_WIDE)?\b/.test(source),
    ).map(([path]) => path)

    expect(wearing.sort()).toEqual([
      '../features/generation/components/Generator/GeneratorComments.tsx',
      '../features/generation/components/Generator/GeneratorSources.tsx',
      '../features/git/components/Commit/CommitFiles.tsx',
      '../features/git/components/Diff/DiffImages.tsx',
      '../features/git/components/Git/File/GitFileGroup.tsx',
      '../features/scene/components/ComponentsSection.tsx',
      './DynamicForm/DynamicForm.tsx',
    ])
  })
})
describe('what a line names', () => {
  it('is worn rather than written out again', () => {
    const offenders = WRITTEN_SOURCES.filter(
      ([path, source]) => !GUARDED.includes(path) && spellsOutSubject(source),
    ).map(([path]) => path)

    expect(offenders).toEqual([])
  })

  it('leaves the muted readout of a colour alone, which shares four of the five', () => {
    expect(spellsOutSubject(`'${COLOR_READOUT}'`)).toBe(false)
  })

  // Named rather than counted: a count stays green when one site drops the constant and another
  // picks it up. **Blind**: raw text, so a comment naming the constant would count as wearing it.
  it('is worn by the four that name a line', () => {
    const wearing = WRITTEN_SOURCES.filter(
      ([path, source]) => !GUARDED.includes(path) && /\bROW_SUBJECT\b/.test(source),
    ).map(([path]) => path)

    expect(wearing.sort()).toEqual([
      '../features/git/components/Diff/DiffPane.tsx',
      '../features/git/components/History/HistoryRow.tsx',
      // A fourth on 2026-08-24: the home's models band names its sources the same way, and had
      // spelled the five words out before this rule said so.
      '../features/home/components/ModelInventory/ModelInventoryMeans.tsx',
      '../features/material/components/StylesSection/StylesSectionRow.tsx',
    ])
  })
})

describe('the box a panel puts above what it acts on', () => {
  it('is worn rather than written out again', () => {
    const offenders = WRITTEN_SOURCES.filter(
      ([path, source]) => !GUARDED.includes(path) && spellsOutPanelHead(source),
    ).map(([path]) => path)

    expect(offenders).toEqual([])
  })

  it('leaves alone a column ruled off in the other vocabulary', () => {
    expect(spellsOutPanelHead("'border-base-300 flex flex-col gap-2 border-b p-2'")).toBe(false)
  })

  // Named rather than counted. **Blind**: raw text, as above.
  it('is worn by the two it was extracted from, and by the context card', () => {
    const wearing = WRITTEN_SOURCES.filter(
      ([path, source]) => !GUARDED.includes(path) && /\bPANEL_HEAD\b/.test(source),
    ).map(([path]) => path)

    expect(wearing.sort()).toEqual([
      // Not a panel HEAD, and it wears this anyway: a context card is a block ruled off by the
      // same trait, with the same room, and a fourth spelling of those five words is what the
      // rule above exists to prevent.
      '../features/context/components/Context/ContextCardRow.tsx',
      '../features/git/components/Commit/CommitBox.tsx',
      './CollectionBar/CollectionBar.tsx',
    ])
  })
})

describe('the line a pane draws above what it shows', () => {
  it('is worn rather than written out again', () => {
    const offenders = WRITTEN_SOURCES.filter(
      ([path, source]) => !GUARDED.includes(path) && spellsOutPanelBar(source),
    ).map(([path]) => path)

    expect(offenders).toEqual([])
  })

  it('leaves alone the bar of the activity list, which sets its buttons closer', () => {
    expect(spellsOutPanelBar("'border-border flex items-center gap-1.5 border-b p-1'")).toBe(false)
  })

  // Named rather than counted. **Blind**: raw text, as above.
  it('is worn by the four it was extracted from', () => {
    const wearing = WRITTEN_SOURCES.filter(
      ([path, source]) => !GUARDED.includes(path) && /\bPANEL_BAR\b/.test(source),
    ).map(([path]) => path)

    expect(wearing.sort()).toEqual([
      '../features/git/components/Diff/DiffPane.tsx',
      '../features/git/components/Git/GitReady.tsx',
      '../features/git/components/Remote/RemoteSetup.tsx',
      './CollectionBar/CollectionBar.tsx',
    ])
  })
})
