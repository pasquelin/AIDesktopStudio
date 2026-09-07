import { describe, expect, it } from 'vitest'
import { centredIn } from './placement'

describe('where a centred window opens', () => {
  it('sits in the middle of the work area, menu bar and dock excluded', () => {
    expect(
      centredIn({ x: 0, y: 25, width: 1440, height: 1000 }, { width: 960, height: 760 }),
    ).toEqual({ x: 240, y: 145, width: 960, height: 760 })
  })

  it('follows the display it is given rather than the origin', () => {
    expect(
      centredIn({ x: 1440, y: 0, width: 1000, height: 800 }, { width: 960, height: 760 }),
    ).toEqual({ x: 1460, y: 20, width: 960, height: 760 })
  })

  /** Frameless and not resizable: taller than the work area, the footer sits off the screen. */
  it('never asks for more room than the work area has', () => {
    expect(
      centredIn({ x: 0, y: 25, width: 1366, height: 728 }, { width: 960, height: 760 }),
    ).toEqual({ x: 203, y: 25, width: 960, height: 728 })
  })
})
