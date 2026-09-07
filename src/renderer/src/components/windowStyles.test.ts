import { describe, expect, it } from 'vitest'
import { rewrites, spellsOut, WRITTEN_SOURCES } from './testHarness'
import { WINDOW_ROW, WINDOW_ROW_BUTTON } from './windowStyles'

/** As `WRITTEN_SOURCES` keys it: the glob resolves against `testHarness.ts`, its own neighbour. */
const GUARDED = './windowStyles.ts'

/**
 * The rule off the constant, minus the last-child clause: a hand copy that borders every line
 * INCLUDING the last one is the same copy, and requiring `last:border-b-0` would let it through.
 * What is left still separates a list line from a table rule — `gap-2` with `py-3`.
 */
const spellsOutRow = spellsOut(WINDOW_ROW.split(' ').filter(one => !one.startsWith('last:')))

/** The way the two search results were made clickable before they had a constant. */
const redressesRow = rewrites('WINDOW_ROW', ['hover:bg-base-200', 'w-full', 'text-left'])

describe('the line of a list in an app window', () => {
  it('finds the sources at all, so the rules below cannot pass on an empty list', () => {
    expect(WRITTEN_SOURCES.length).toBeGreaterThan(100)
    expect(WRITTEN_SOURCES.map(([path]) => path)).toContain(GUARDED)
  })

  it('is the line, plus what makes the whole of it a button and nothing more', () => {
    expect(WINDOW_ROW_BUTTON.split(' ')).toEqual([
      ...WINDOW_ROW.split(' '),
      'hover:bg-base-200',
      'w-full',
      'text-left',
    ])
  })

  it('is worn rather than written out again', () => {
    const offenders = WRITTEN_SOURCES.filter(
      ([path, source]) => path !== GUARDED && spellsOutRow(source),
    ).map(([path]) => path)

    expect(offenders).toEqual([])
  })

  it('is worn rather than made clickable again at the call', () => {
    const offenders = WRITTEN_SOURCES.filter(
      ([path, source]) => path !== GUARDED && redressesRow(source),
    ).map(([path]) => path)

    expect(offenders).toEqual([])
  })

  it('leaves alone the lines of these windows that only share part of the shape', () => {
    // The row of the usage table, the line of its overview, and the footer of the settings draft
    // bar — all three wear `border-base-300`, none is this line.
    expect(spellsOutRow('"border-base-300 border-b last:border-b-0"')).toBe(false)
    expect(
      spellsOutRow('"border-base-300 flex items-baseline justify-between border-b py-1.5"'),
    ).toBe(false)
    expect(spellsOutRow('"border-base-300 flex shrink-0 gap-2 border-t px-4 py-2"')).toBe(false)
  })

  // The partner of the rules above, named rather than counted: a count stays green when one
  // line drops the constant and another picks it up, which is the drift this lot closed.
  it('is worn by every line of these windows that has this shape', () => {
    const wearing = WRITTEN_SOURCES.filter(
      ([path, source]) => path !== GUARDED && /\bWINDOW_ROW(?:_BUTTON)?\b/.test(source),
    ).map(([path]) => path)

    expect(wearing.sort()).toEqual([
      '../features/document/components/NewDocument/NewDocumentNoProject.tsx',
      '../features/manual/components/ManualWindow/ManualWindowResults.tsx',
      '../features/settings/components/Ai/AiChoiceRow.tsx',
      '../features/settings/components/Ai/AiCloudModel.tsx',
      '../features/settings/components/Ai/AiStudioModel.tsx',
      '../features/settings/components/InputSettings.tsx',
      '../features/settings/components/Setting/SettingLine.tsx',
      '../features/settings/components/SettingsWindow/SettingsWindowResultRow.tsx',
    ])
  })
})
