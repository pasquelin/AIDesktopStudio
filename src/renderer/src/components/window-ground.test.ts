import { describe, expect, it } from 'vitest'
import { WINDOW_SOURCES } from '../windowSources'

/**
 * What every window of the studio stands on, and it is ONE colour: the chassis.
 *
 * The main process paints it before the first frame — `main/window/theme.test.ts` pins
 * `WINDOW_CHROME_COLOR` to `--color-chassis` — so a page painting anything else opens on one
 * colour and settles on another. `WindowShell` ground itself on DaisyUI's `base-200`, the PANEL
 * step, and five windows came up near-black beside a grey studio.
 */
const FRAMES_A_WINDOW = /<WindowTitleBar[\s>]/

/**
 * Unanchored on purpose: `prettier-plugin-tailwindcss` decides where the fill lands in the
 * attribute, so a pattern reading the FIRST class would accuse a correct file and — the costly
 * half — walk past a wrong one.
 *
 * **Blind, twice**: a ground reached through `cn()` rather than written out, and WHICH element
 * wears it — a `bg-chassis` on an inner div satisfies this while the root wears something else.
 * A rule reading `bg-base-\d00` anywhere in the file was tried and dropped: it refuses the inner
 * `bg-base-100` blocks the licences window and the manual legitimately lay on their ground.
 */
const GROUNDS_ON_THE_CHASSIS = /className="[^"]*\bbg-chassis\b/

describe('the ground under a window', () => {
  /** Read off the BAR, never a list: a window is what wears `WindowTitleBar`, whatever frames it. */
  const framed = Object.entries(WINDOW_SOURCES)
    .filter(([path]) => path !== './components/WindowTitleBar.tsx')
    .filter(([, code]) => FRAMES_A_WINDOW.test(code))

  it('finds the windows at all, so the rules below cannot pass on an empty list', () => {
    expect(Object.keys(WINDOW_SOURCES).length).toBeGreaterThan(400)
    expect(framed.length).toBeGreaterThan(0)
  })

  it('is the chassis, in every window that wears the bar', () => {
    const elsewhere = framed
      .filter(([, code]) => !GROUNDS_ON_THE_CHASSIS.test(code))
      .map(([path]) => path)

    expect(elsewhere.sort()).toEqual([])
  })

  it('reads a fill wherever the formatter puts it, which is what makes it a rule', () => {
    expect(GROUNDS_ON_THE_CHASSIS.test('<div className="flex bg-chassis">')).toBe(true)
    expect(GROUNDS_ON_THE_CHASSIS.test('<div className="flex bg-base-200">')).toBe(false)
  })
})
