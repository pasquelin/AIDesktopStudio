import { describe, expect, it } from 'vitest'
import { WINDOW_SOURCES } from '../windowSources'

/**
 * One bar over every window, drawn one way.
 *
 * The settings window, the licences one and the usage one each carried the same `<header>` with
 * the same `pl-24` — the inset that clears the native traffic lights — and the skeleton window
 * made a fourth. An inset spelled four times is one nobody notices has drifted until a window
 * ships with its title under a button.
 *
 * Written like `one-toolbar.test.ts`, and for the same reason: no prop was misused, a component
 * was simply not reached for.
 */
const DRAGS_A_BAR = /style=\{DRAGGABLE\}/

/**
 * Where a dragged bar is legitimately spelled: this one, and the studio's own title bar, which
 * carries the workspace pills rather than a title and is the chrome of the MAIN window.
 */
const DECLARE_BARS: readonly string[] = [
  './components/WindowTitleBar.tsx',
  './features/shell/components/TitleBar/TitleBar.tsx',
  // Names nothing and insets nothing: the band a window with no title bar at all is moved by.
  './components/WindowDragBand.tsx',
]

describe('the bar over a window', () => {
  it('finds the sources at all, so the rule below cannot pass on an empty list', () => {
    expect(Object.keys(WINDOW_SOURCES).length).toBeGreaterThan(400)
  })

  /**
   * Its blind spot, written rather than hidden: it reads the DRAG, which is what makes a bar a
   * window's own. A header laid out by hand and left undraggable walks past it — and so does one
   * that reaches the drag through a helper of its own.
   */
  it('is declared once, never spelled again beside it', () => {
    const spelling = Object.entries(WINDOW_SOURCES)
      .filter(([path]) => !DECLARE_BARS.includes(path))
      .filter(([, code]) => DRAGS_A_BAR.test(code))
      .map(([path]) => path)

    expect(spelling.sort()).toEqual([])
  })

  it('is what every window frame puts at its top', () => {
    expect(WINDOW_SOURCES['./components/WindowShell.tsx']).toMatch(/<WindowTitleBar[\s>]/)
  })
})
