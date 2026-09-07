import { describe, expect, it } from 'vitest'
import { brushRect, tileBytes, tileKey, tilesCovering, TILE_SIZE, unionOf } from './tiles'

const DOCUMENT = { width: 1024, height: 1024 }

describe('tilesCovering', () => {
  it('returns the single tile a small stroke sits in', () => {
    const tiles = tilesCovering({ x: 10, y: 10, width: 20, height: 20 }, DOCUMENT)

    expect(tiles).toHaveLength(1)
    expect(tileKey(tiles[0]!)).toBe('0,0')
  })

  it('returns every tile a rectangle straddles', () => {
    const tiles = tilesCovering({ x: 500, y: 500, width: 40, height: 40 }, DOCUMENT)

    expect(tiles.map(tileKey)).toEqual(['0,0', '1,0', '0,1', '1,1'])
  })

  // A dab half off the frame is the ordinary case, and a tile outside it holds nothing to undo to.
  it('clips to the document rather than booking tiles outside it', () => {
    const tiles = tilesCovering({ x: -200, y: -200, width: 300, height: 300 }, DOCUMENT)

    expect(tiles.map(tileKey)).toEqual(['0,0'])
  })

  it('returns nothing for a rectangle entirely outside the frame', () => {
    expect(tilesCovering({ x: 2000, y: 0, width: 10, height: 10 }, DOCUMENT)).toEqual([])
  })

  it('normalises a rectangle dragged up and to the left', () => {
    const tiles = tilesCovering({ x: 600, y: 600, width: -400, height: -400 }, DOCUMENT)

    expect(tiles.map(tileKey)).toEqual(['0,0', '1,0', '0,1', '1,1'])
  })

  // The last column of a document that is not a multiple of the tile size is a narrow strip, and
  // capturing a full-width texture there would read pixels the layer does not have.
  it('shrinks the tiles at the far edge to what the document actually holds', () => {
    const tiles = tilesCovering(
      { x: 0, y: 0, width: 700, height: 700 },
      { width: 700, height: 600 },
    )
    const last = tiles.at(-1)

    expect(last?.width).toBe(700 - TILE_SIZE)
    expect(last?.height).toBe(600 - TILE_SIZE)
  })

  it('costs four bytes a pixel', () => {
    expect(tileBytes({ column: 0, row: 0, x: 0, y: 0, width: 512, height: 512 })).toBe(
      512 * 512 * 4,
    )
  })
})

describe('unionOf', () => {
  it('gives the one box every rectangle falls in, whatever their order', () => {
    expect(
      unionOf([
        { x: 40, y: 8, width: 8, height: 8 },
        { x: 0, y: 24, width: 8, height: 8 },
      ]),
    ).toEqual({ x: 0, y: 8, width: 48, height: 24 })
  })
})

describe('brushRect', () => {
  it('spreads the box around every point by the radius', () => {
    const rect = brushRect(
      [
        { x: 100, y: 100 },
        { x: 140, y: 120 },
      ],
      10,
    )

    // Eleven, not ten: the antialiased rim reaches a pixel past the geometric radius.
    expect(rect).toEqual({ x: 89, y: 89, width: 40 + 22, height: 20 + 22 })
  })

  it('is empty when there is no point at all', () => {
    expect(brushRect([], 10)).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })
})
