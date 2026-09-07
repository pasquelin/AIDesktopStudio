import { describe, expect, it } from 'vitest'
import { FLY_SPEEDS } from '@shared/domain/snap'
import { stylesheet } from '@/indexCss-fixtures'
import { SNAP_STEP_CONTROLS } from './sceneSnapControls'

/**
 * How many figures a row of a value menu holds, read off the stylesheet rather than repeated here:
 * the count lives in `--sc-value-grid` (`index.css`), and a copy would let the two drift. EVERY
 * declaration of it, so a density block saying `repeat(3, …)` cannot pass while `:root` says four.
 */
const columns = (): number => {
  const declared = [...stylesheet.matchAll(/--sc-value-grid:\s*repeat\((\d+)/g)].map(match =>
    Number(match[1]),
  )
  if (!declared.length) throw new Error('`--sc-value-grid` declares no repeat() in index.css')
  expect(new Set(declared).size).toBe(1)
  return declared[0] ?? 0
}

type OfferedList = [name: string, values: readonly number[]]

/**
 * 🛑 Blind spot: the speed has no control record, so its list is named here BY HAND. A fifth
 * value menu with a list of its own is covered by nobody until someone adds a line.
 */
const OFFERED: readonly OfferedList[] = [
  ...SNAP_STEP_CONTROLS.flatMap((control): OfferedList[] => [
    [`${control.kind} steps`, control.steps],
    ...(control.divisions
      ? [[`${control.kind} divisions`, control.divisions] satisfies OfferedList]
      : []),
  ]),
  ['fly speeds', FLY_SPEEDS],
]

describe('what the snap bar offers', () => {
  /**
   * The four menus read as one family only while every list fills whole rows. One figure too
   * many leaves an orphan alone on a line, and the menu it belongs to stands a row taller than
   * its neighbours — which nothing else in this repository would catch.
   */
  it.each(OFFERED)('lays %s out in whole rows', (_name, values) => {
    expect(values.length % columns()).toBe(0)
  })

  // An empty list divides evenly too, so the rule above would hold over a menu with nothing in it.
  it('offers a full row of each rather than nothing at all', () => {
    for (const [, values] of OFFERED) expect(values.length).toBeGreaterThanOrEqual(columns())
  })
})
