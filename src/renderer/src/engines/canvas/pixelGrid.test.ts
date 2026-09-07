import { describe, expect, it } from 'vitest'
import {
  cellFor,
  cellRuns,
  cellsOfLine,
  cellsOfRect,
  cellsSpanning,
  gridIsLegible,
  stampRect,
} from './pixelGrid'

describe('stampRect', () => {
  it('gives one rectangle for every point inside the same cell', () => {
    const corner = stampRect({ x: 32, y: 32 }, 16, 16)

    expect(stampRect({ x: 47.9, y: 32.1 }, 16, 16)).toEqual(corner)
    expect(corner).toEqual({ x: 32, y: 32, width: 16, height: 16 })
    expect(stampRect({ x: 48, y: 32 }, 16, 16)).not.toEqual(corner)
  })

  it('centres an odd brush on the pointer, and grows an even one forwards', () => {
    expect(stampRect({ x: 50, y: 50 }, 10, 30)).toEqual({ x: 40, y: 40, width: 30, height: 30 })
    expect(stampRect({ x: 50, y: 50 }, 10, 20)).toEqual({ x: 50, y: 50, width: 20, height: 20 })
  })

  it('never shrinks a brush below the one cell that always marks', () => {
    expect(stampRect({ x: 0, y: 0 }, 16, 1)).toEqual({ x: 0, y: 0, width: 16, height: 16 })
  })
})

describe('cellsOfLine', () => {
  // Symmetric on a 45° diagonal and NOT in general — a shallow slope walked backwards gives a
  // different staircase, which is Bresenham and not a defect.
  it('walks a diagonal with neither a gap nor a cell twice', () => {
    const cells = cellsOfLine({ x: 0, y: 0 }, { x: 4, y: 4 })

    expect(cells).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
      { x: 4, y: 4 },
    ])
    expect(cellsOfLine({ x: 4, y: 4 }, { x: 0, y: 0 })).toEqual([...cells].reverse())
  })

  it('steps once per column on a shallow slope', () => {
    expect(cellsOfLine({ x: 0, y: 0 }, { x: 4, y: 1 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 1 },
      { x: 4, y: 1 },
    ])
  })

  it('answers a single cell for a line that goes nowhere', () => {
    expect(cellsOfLine({ x: 7, y: 3 }, { x: 7, y: 3 })).toEqual([{ x: 7, y: 3 }])
  })

  // Both would walk forever: `NaN` loses every comparison, and a billion cells holds the frame.
  it('refuses ends no document can hold rather than walking them', () => {
    expect(cellsOfLine({ x: 0, y: 0 }, { x: Number.NaN, y: 0 })).toEqual([])
    expect(cellsOfLine({ x: 0, y: 0 }, { x: 1e9, y: 0 })).toEqual([])
  })
})

describe('cellsOfRect', () => {
  it('draws the outline alone, and every cell of it once filled', () => {
    expect(cellsOfRect({ x: 1, y: 1 }, { x: 3, y: 3 }, false)).toHaveLength(8)
    expect(cellsOfRect({ x: 1, y: 1 }, { x: 3, y: 3 }, true)).toHaveLength(9)
    expect(cellsOfRect({ x: 3, y: 3 }, { x: 1, y: 1 }, true)).toEqual(
      cellsOfRect({ x: 1, y: 1 }, { x: 3, y: 3 }, true),
    )
  })

  // 🛑 Measured: a FILLED 4096 a side is 2 415 ms of the UI thread, and the corners come from a
  // caller — `canvas.drawPixels` names them, so nothing else stands between a model and a frozen
  // window. Its clipping to the grid lives in the handler, which is the half that knows the grid.
  it('refuses corners no grid can hold rather than walking them', () => {
    expect(cellsOfRect({ x: 0, y: 0 }, { x: Number.NaN, y: 0 }, true)).toEqual([])
    expect(cellsOfRect({ x: 0, y: 0 }, { x: 99_999, y: 99_999 }, true)).toEqual([])
  })

  /**
   * An outline costs its PERIMETER: scanning the inside to throw it away spent the sixteen million
   * steps of a filled square to emit sixteen thousand cells. 2 415 ms became 1,5 ms.
   */
  it('walks the border of a square no filled one could reach', () => {
    const border = cellsOfRect({ x: 0, y: 0 }, { x: 4095, y: 4095 }, false)

    expect(border).toHaveLength(4096 * 2 + (4096 - 2) * 2)
    expect(cellsOfRect({ x: 0, y: 0 }, { x: 4095, y: 4095 }, true)).toEqual([])
  })
})

describe('cellsSpanning', () => {
  it('counts a partial last column in, since it is still a cell one can paint', () => {
    expect(cellsSpanning(1024, 16)).toBe(64)
    expect(cellsSpanning(1000, 16)).toBe(63)
  })
})

describe('cellFor', () => {
  it('is the inverse of cellsSpanning, whatever the document measures', () => {
    expect(cellFor(1024, 64)).toBe(16)
    expect(cellFor(64, 64)).toBe(1)
    expect(cellsSpanning(1024, cellFor(1024, 64))).toBe(64)
  })

  /**
   * 🛑 The title above claimed this and asserted only exact DIVISORS. Rounding overshot on
   * sixteen counts of a 1024 side: 3 gave a cell of 341, which spans 4, and the field's second
   * try was refused for naming the value already held — three columns could not be reached.
   */
  it('reaches a count that does not divide the side, which rounding overshot', () => {
    expect(cellsSpanning(1024, cellFor(1024, 3))).toBe(3)
    expect(cellsSpanning(800, cellFor(800, 7))).toBe(7)
    expect(cellsSpanning(333, cellFor(333, 20))).toBe(20)
  })

  it('never asks for a cell of nothing, however many are wanted', () => {
    expect(cellFor(64, 4096)).toBe(1)
  })
})

describe('cellRuns', () => {
  // Two 2-cell squares one step apart on a diagonal share a row: one run, not two overlapping
  // squares — which is what keeps a half-opaque stroke flat.
  it('merges the squares of a line into one run per row', () => {
    const runs = cellRuns(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      8,
      16,
    )

    expect(runs).toEqual([
      { x: 0, y: 0, width: 16, height: 8 },
      { x: 0, y: 8, width: 24, height: 8 },
      { x: 8, y: 16, width: 16, height: 8 },
    ])
  })
})

describe('gridIsLegible', () => {
  it('gives up before the lines close into a wash', () => {
    expect(gridIsLegible(1, 6)).toBe(true)
    expect(gridIsLegible(1, 4)).toBe(false)
  })
})
