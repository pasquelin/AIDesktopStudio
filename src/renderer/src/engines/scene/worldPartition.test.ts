import { describe, expect, it } from 'vitest'
import { buildPartition, CELL_SIZE, cellCoords, cellKey, MACRO_SIZE } from './worldPartition'

const held = (keys: number[]): ReturnType<typeof buildPartition> => {
  const index = buildPartition()
  for (const key of keys) index.hold(key)
  return index
}

/** The cells a disc touches, as coordinates, so a failure reads as a place and not as a number. */
const around = (
  index: ReturnType<typeof buildPartition>,
  x: number,
  z: number,
  radius: number,
): { cx: number; cz: number }[] => {
  const into: number[] = []
  index.query(x, z, radius, into)
  return into.map(cellCoords).sort((one, other) => one.cx - other.cx || one.cz - other.cz)
}

describe('the key a cell is filed under', () => {
  it('reads back the coordinates it was spelled from, negatives included', () => {
    // The anchor is the world ORIGIN, so half the cells of an ordinary level are negative — a key
    // that only held positives would file the whole of one quadrant on top of another.
    for (const [cx, cz] of [
      [0, 0],
      [3, 7],
      [-1, -1],
      [-4096, 2048],
    ]) {
      expect(cellCoords(cellKey(cx ?? 0, cz ?? 0))).toEqual({ cx, cz })
    }
  })

  it('gives two different cells two different keys', () => {
    expect(cellKey(1, 0)).not.toBe(cellKey(0, 1))
    expect(cellKey(-1, 0)).not.toBe(cellKey(0, -1))
  })
})

describe('buildPartition', () => {
  it('files a point under the cell of its grain, anchored on the origin', () => {
    const index = buildPartition()

    expect(index.cellAt(0, 0)).toBe(cellKey(0, 0))
    expect(index.cellAt(CELL_SIZE + 1, 2 * CELL_SIZE + 1)).toBe(cellKey(1, 2))
    // A body just left of the origin is in the cell BEFORE it, never in the same one: rounding
    // towards zero would make the cell astride the origin twice as wide as every other.
    expect(index.cellAt(-1, -1)).toBe(cellKey(-1, -1))
  })

  it('holds a body apart once it spills past half a cell', () => {
    const index = buildPartition()

    // Filed in one cell, a body wider than that would lose itself — and its shadow — the moment
    // that cell left the zone, while standing across three others.
    expect(index.fitsACell(CELL_SIZE / 2)).toBe(true)
    expect(index.fitsACell(CELL_SIZE / 2 + 1)).toBe(false)
  })

  it('counts a cell once however many times it is held', () => {
    const index = held([cellKey(0, 0), cellKey(0, 0), cellKey(1, 0)])

    expect(index.stats().cells).toBe(2)
  })

  it('forgets a cell nothing holds any more, and the macro-chunk left empty with it', () => {
    const index = held([cellKey(0, 0)])
    index.release(cellKey(0, 0))

    expect(index.stats()).toMatchObject({ cells: 0, macros: 0 })
    expect(around(index, 0, 0, 1000)).toEqual([])
  })

  it('answers the cells a disc really touches, and not the square around it', () => {
    const index = held([cellKey(0, 0), cellKey(1, 0), cellKey(1, 1), cellKey(5, 5)])

    // The diagonal neighbour is 362 units away at its nearest corner, so a disc of 256 misses it
    // — while the SQUARE the query walks holds it. Read off the centres it would be missed too.
    expect(around(index, 0, 0, CELL_SIZE)).toEqual([
      { cx: 0, cz: 0 },
      { cx: 1, cz: 0 },
    ])
  })

  it('answers a cell a body of the disc only clips a corner of', () => {
    const index = held([cellKey(1, 1)])

    // The disc is centred on the origin corner of the cell: the nearest point of the square is
    // the corner itself, and a test on cell CENTRES would have dropped it.
    expect(around(index, CELL_SIZE - 1, CELL_SIZE - 1, 2)).toEqual([{ cx: 1, cz: 1 }])
  })

  it('never opens a macro-chunk the disc misses', () => {
    const index = buildPartition()
    const perMacro = MACRO_SIZE / CELL_SIZE
    // One cell per macro-chunk over a square of ten by ten of them, so opening one that is out
    // of range would show as a node visited that answered nothing.
    for (let cx = 0; cx < 10; cx += 1) {
      for (let cz = 0; cz < 10; cz += 1) index.hold(cellKey(cx * perMacro, cz * perMacro))
    }

    const near = around(index, 0, 0, CELL_SIZE)
    // Four macro-chunks in the query's range, one of which exists, plus the one cell it holds —
    // out of a hundred. The other ninety-nine are never looked at.
    expect({ near, visited: index.stats().nodesVisited }).toEqual({
      near: [{ cx: 0, cz: 0 }],
      visited: 5,
    })
  })

  it('walks a handful of nodes for a zone of five hundred over a level of a thousand cells', () => {
    const index = buildPartition()
    for (let cx = -50; cx < 50; cx += 1) {
      for (let cz = -50; cz < 50; cz += 1) index.hold(cellKey(cx, cz))
    }

    const near = around(index, 0, 0, 500)
    // What the whole thing is for: the level holds 10 000 cells and the query touches 21 of them.
    // Measured on the spike at 500 000 bodies, 45 nodes visited — this is the same walk.
    expect(index.stats().nodesVisited).toBeLessThan(80)
    expect(near.length).toBeLessThan(30)
    expect(index.stats().cellsReturned).toBe(near.length)
  })

  it('empties the array it is handed rather than growing it', () => {
    const index = held([cellKey(0, 0)])
    const into = [cellKey(9, 9)]

    index.query(0, 0, 1, into)

    expect(into).toEqual([cellKey(0, 0)])
  })
})
