import { describe, expect, it } from 'vitest'
import { emptyGroundPaint } from './groundPaint'
import { scatterMaskFromGroundPaint } from './groundPaintMask'
import { chunkLayout, unpackDeltas } from './relief'
import { SCATTER_MASK_TEXELS } from './scatter'

describe('ground paint scatter mask', () => {
  it('derives placement weights from the requested painted channel', () => {
    const paint = emptyGroundPaint(2, 2)
    paint.pixels.set([200, 255, 20, 255], 0)
    paint.pixels.set([0, 128, 0, 128], 4)

    const extent = { origin: { x: 0, z: 0 }, size: { x: 10, z: 10 } }
    const mask = scatterMaskFromGroundPaint(paint, extent, extent, 64)
    const west = unpackDeltas(mask.chunks[0]?.payload ?? '', 64 * 64)
    const east = unpackDeltas(mask.chunks[3]?.payload ?? '', 64 * 64)
    const south = unpackDeltas(mask.chunks[12]?.payload ?? '', 64 * 64)

    expect(west[0]).toBeCloseTo(1)
    expect(east[63]).toBeCloseTo(128 / 255)
    expect(south[0]).toBe(0)
  })

  it('packs every chunk the width its readers decode it at', () => {
    const paint = emptyGroundPaint(4, 4)
    for (let at = 0; at < 16; at += 1) paint.pixels.set([0, 255, 0, 255], at * 4)
    const extent = { origin: { x: 0, z: 0 }, size: { x: 10, z: 10 } }

    const mask = scatterMaskFromGroundPaint(paint, extent, extent, 64)

    // Decoded the way `scatterGenerate` and `scatterFollow` do it: chunks SHARE their edge, so an
    // inner one is `grain + 1` wide. Packed `grain` wide, a uniform paint came back sheared.
    const off = mask.chunks.flatMap(packed => {
      const layout = chunkLayout(
        packed.column,
        packed.row,
        SCATTER_MASK_TEXELS,
        SCATTER_MASK_TEXELS,
        64,
      )
      const deltas = unpackDeltas(packed.payload, layout.width * layout.height)
      return [...deltas].filter(weight => Math.abs(weight - 1) > 1e-3)
    })

    expect(off).toEqual([])
  })
})
