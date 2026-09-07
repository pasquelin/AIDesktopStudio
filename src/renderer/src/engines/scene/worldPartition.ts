/**
 * Where the bodies of a level stand, coarse enough that a camera can ask what is near it without
 * touching the whole world.
 *
 * Two levels, never three: measured over 500 000 bodies, the flattening of a level is 75.2, so the
 * height carries no information a split could use. A query walks the macro-chunks a disc touches
 * and opens only the ones that are not empty — 45 nodes visited for a disc of 500 over a world of
 * 500 000, against the 19 regions of the triangle budget, which covered the whole level.
 */

import { clamp } from '@shared/numeric'

/** The grain of a cell. Fixed and SPATIAL, so a lot can never spread past one cell. */
export const CELL_SIZE = 256

/** What sits above the cells. Two cells a side: a coarser roof visits emptier nodes. */
export const MACRO_SIZE = 512

/** Largest reach kept spatial; beyond it the conservative global fallback costs less to query. */
export const MAX_SPATIAL_REACH = 2_048

export type CellKey = number

export type PartitionStats = {
  cells: number
  macros: number
  /** What the last query walked: the macro-chunks in range, plus the cells of those it opened. */
  nodesVisited: number
  cellsReturned: number
  /** What the index occupies, bodies and meshes excluded. */
  bytes: number
}

export type WorldPartition = {
  cellSize: number
  /** The cell a point falls in — the same answer for the same point, run after run. */
  cellAt: (x: number, z: number) => CellKey
  /**
   * Whether a body of this reach belongs to a cell at all.
   *
   * One that spills further than half a cell would stand across several, and holding it in one
   * would lose it — and its shadow — as soon as that one left the active zone. It is drawn apart.
   */
  fitsACell: (reach: number) => boolean
  /** Registers a cell that now holds something. */
  hold: (key: CellKey) => void
  /** Drops a cell that holds nothing any more. */
  release: (key: CellKey) => void
  /** The cells a disc of `radius` around (x, z) touches, into `into` rather than a fresh array. */
  query: (x: number, z: number, radius: number, into: CellKey[]) => void
  stats: () => PartitionStats
}

/**
 * Half the span a key can spell on one axis, in cells. A body past it is filed in the edge cell
 * rather than colliding with another one's — wrong by a draw call, never by a body lost.
 */
const HALF_SPAN = 32_768

const AXIS = HALF_SPAN * 2

export const cellKey = (cx: number, cz: number): CellKey =>
  (clamp(cx, -HALF_SPAN, HALF_SPAN - 1) + HALF_SPAN) * AXIS +
  (clamp(cz, -HALF_SPAN, HALF_SPAN - 1) + HALF_SPAN)

/** Read apart, so a query that visits forty-five cells allocates no pair for any of them. */
const cellX = (key: CellKey): number => Math.floor(key / AXIS) - HALF_SPAN
const cellZ = (key: CellKey): number => (key % AXIS) - HALF_SPAN

export const cellCoords = (key: CellKey): { cx: number; cz: number } => ({
  cx: cellX(key),
  cz: cellZ(key),
})

/**
 * The index, anchored on the world origin rather than on the bodies it is given.
 *
 * An anchor read off the extent moves the day a body is added past the old edge, and every cell
 * of the world changes key with it — which is the whole of what this exists to avoid.
 */
export function buildPartition(cellSize = CELL_SIZE, macroSize = MACRO_SIZE): WorldPartition {
  const perMacro = Math.max(1, Math.round(macroSize / cellSize))
  const macroSpan = perMacro * cellSize
  const macros = new Map<CellKey, Set<CellKey>>()
  let cells = 0
  const seen = { nodesVisited: 0, cellsReturned: 0 }

  const macroOf = (key: CellKey): CellKey =>
    cellKey(Math.floor(cellX(key) / perMacro), Math.floor(cellZ(key) / perMacro))

  return {
    cellSize,

    cellAt: (x, z) => cellKey(Math.floor(x / cellSize), Math.floor(z / cellSize)),

    fitsACell: reach => reach <= cellSize / 2,

    hold: key => {
      const macro = macroOf(key)
      const inside = macros.get(macro)
      if (!inside) {
        macros.set(macro, new Set([key]))
        cells += 1
        return
      }
      if (inside.has(key)) return
      inside.add(key)
      cells += 1
    },

    release: key => {
      const macro = macroOf(key)
      const inside = macros.get(macro)
      if (!inside?.delete(key)) return
      cells -= 1
      if (inside.size === 0) macros.delete(macro)
    },

    query: (x, z, radius, into) => {
      into.length = 0
      seen.nodesVisited = 0
      const lowX = Math.floor((x - radius) / macroSpan)
      const highX = Math.floor((x + radius) / macroSpan)
      const lowZ = Math.floor((z - radius) / macroSpan)
      const highZ = Math.floor((z + radius) / macroSpan)

      for (let mx = lowX; mx <= highX; mx += 1) {
        for (let mz = lowZ; mz <= highZ; mz += 1) {
          seen.nodesVisited += 1
          const inside = macros.get(cellKey(mx, mz))
          if (!inside) continue
          // A macro-chunk whole of which is out of the disc: its cells are never opened.
          if (!touches(mx * macroSpan, mz * macroSpan, macroSpan, x, z, radius)) continue
          for (const key of inside) {
            seen.nodesVisited += 1
            if (touches(cellX(key) * cellSize, cellZ(key) * cellSize, cellSize, x, z, radius)) {
              into.push(key)
            }
          }
        }
      }
      seen.cellsReturned = into.length
    },

    stats: () => ({
      cells,
      macros: macros.size,
      nodesVisited: seen.nodesVisited,
      cellsReturned: seen.cellsReturned,
      // A `Set` entry and its key: what a footprint is compared against, never billed to the byte.
      bytes: macros.size * 48 + cells * 12,
    }),
  }
}

/** Whether a square of `span` at (lowX, lowZ) meets a disc — through its nearest point. */
function touches(
  lowX: number,
  lowZ: number,
  span: number,
  x: number,
  z: number,
  radius: number,
): boolean {
  const nearX = clamp(x, lowX, lowX + span)
  const nearZ = clamp(z, lowZ, lowZ + span)
  return (nearX - x) ** 2 + (nearZ - z) ** 2 <= radius * radius
}
