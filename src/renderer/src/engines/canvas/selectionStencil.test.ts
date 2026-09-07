import { beforeEach, describe, expect, it, vi } from 'vitest'

const rect = vi.fn()
const moveTo = vi.fn()
const lineTo = vi.fn()
const fill = vi.fn()

vi.mock('pixi.js', () => ({
  Graphics: class {
    rect = rect
    moveTo = moveTo
    lineTo = lineTo
    fill = fill
  },
}))

import { rasterSelectionStencil, selectionStencil } from './selectionStencil'

describe('raster selection stencil', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('draws only opaque raster runs in document coordinates', () => {
    rasterSelectionStencil(
      { x: 10, y: 20, width: 4, height: 2 },
      2,
      2,
      new Uint8Array([255, 0, 0, 255]),
    )

    expect(rect).toHaveBeenCalledTimes(2)
    expect(rect).toHaveBeenNthCalledWith(1, 10, 20, 2, 1)
    expect(rect).toHaveBeenNthCalledWith(2, 12, 21, 2, 1)
  })

  it('preserves the existing ellipse outline', () => {
    selectionStencil({ kind: 'ellipse', rect: { x: 10, y: 20, width: 100, height: 50 } })

    expect(lineTo.mock.calls.length).toBeGreaterThan(3)
  })
})
