import { snap } from '@shared/numeric'
import type { Point } from '../core/geometry'
import { sided, type CanvasState, type Rect } from './canvasState'

// A CELL is one square of the artwork; `cell` is how many document pixels wide it is, and it
// always comes from `pixelCellOf` — nothing here guards a division by it.

export function cellOf(value: number, cell: number): number {
  return Math.floor(value / cell)
}

/** How many cells fit across a side. The last is clipped where `cell` does not divide it. */
export function cellsSpanning(size: number, cell: number): number {
  return Math.max(1, Math.ceil(size / cell))
}

/** What the artwork measures, in cells — `null` for a document that is not on a grid. */
export function gridOf(
  canvas: CanvasState,
): { cell: number; columns: number; rows: number } | null {
  const cell = canvas.pixelCell
  return cell === null
    ? null
    : { cell, columns: cellsSpanning(canvas.width, cell), rows: cellsSpanning(canvas.height, cell) }
}

/**
 * The other way round: the cell a side has to be cut by to hold `wanted` of them.
 *
 * 🛑 `ceil` and not `sided`, whose `round` overshoots: on 1024, sixteen counts a cell CAN reach
 * were unreachable through this — 3 gave a cell of 341, which spans 4, and the second try was
 * refused in silence for naming the value already held.
 */
export function cellFor(size: number, wanted: number): number {
  return cellsSpanning(size, wanted)
}

/** The square a dab stamps. Two points inside one cell give the same rectangle — that is the mode. */
export function stampRect(at: Point, cell: number, brushSize: number): Rect {
  const { across, back } = stampSpan(cell, brushSize)
  const column = cellOf(at.x, cell) - back
  const row = cellOf(at.y, cell) - back

  return { x: column * cell, y: row * cell, width: across * cell, height: across * cell }
}

/**
 * A point moved to the nearest cell BOUNDARY — where a layer's origin lands. Not `cellAt`, which
 * answers which cell a point is inside: an origin belongs between two cells, not to one of them.
 */
export function onCellBoundary(at: Point, cell: number): Point {
  return { x: snap(at.x, cell), y: snap(at.y, cell) }
}

/** One end of a span, grown AWAY from the other — see `cellBox`. */
function grown(near: number, far: number, cell: number): number {
  const bound = near <= far ? Math.floor(near / cell) : Math.ceil(near / cell)
  return bound * cell
}

/**
 * The corners of a box grown to whole cells, each away from the other, and the drag's own
 * orientation kept — a right-to-left drag stays one, which is what tells an arrow its head.
 *
 * 🛑 Never the NEAREST boundary for both: the answer would then depend on where inside a cell the
 * hand started. Measured on a cell of 16 — a drag of 8 px from 220 crosses a boundary and takes
 * NOTHING, while the same 8 px from 210 takes a cell. Grown outward, every cell touched is taken
 * and a drag inside one cell takes that one.
 */
export function cellBox(from: Point, to: Point, cell: number): { from: Point; to: Point } {
  return {
    from: { x: grown(from.x, to.x, cell), y: grown(from.y, to.y, cell) },
    to: { x: grown(to.x, from.x, cell), y: grown(to.y, from.y, cell) },
  }
}

/** The cell a document point falls in, as grid coordinates. */
export function cellAt(point: Point, cell: number): Point {
  return { x: cellOf(point.x, cell), y: cellOf(point.y, cell) }
}

/** How many cells a brush covers, and how many of them sit before the cell under the hand. */
function stampSpan(cell: number, brushSize: number): { across: number; back: number } {
  const across = sided(brushSize / cell)
  return { across, back: Math.floor((across - 1) / 2) }
}

/**
 * The squares of a line's cells merged into one rectangle per row. A square per cell overdrew
 * every fragment `across` times and composited a half-opaque stroke onto itself. Cells of ONE
 * line: a run is a hull, and a gap in a row would be filled.
 */
export function cellRuns(cells: readonly Point[], cell: number, brushSize: number): Rect[] {
  const { across, back } = stampSpan(cell, brushSize)
  const runs = new Map<number, { left: number; right: number }>()

  for (const at of cells) {
    const left = at.x - back
    for (let row = at.y - back; row < at.y - back + across; row += 1) {
      const run = runs.get(row)
      if (run) {
        run.left = Math.min(run.left, left)
        run.right = Math.max(run.right, left + across)
      } else runs.set(row, { left, right: left + across })
    }
  }
  return [...runs].map(([row, run]) => ({
    x: run.left * cell,
    y: row * cell,
    width: (run.right - run.left) * cell,
    height: cell,
  }))
}

/** Twice the longest side a document may have, so no legitimate stroke ever reaches it. */
const MAX_LINE_CELLS = 16384

/**
 * Bresenham between two cells, both ends included: neither a gap nor a cell twice, which an
 * interpolation by distance cannot promise. Empty for ends no document can hold.
 */
export function cellsOfLine(fromCell: Point, toCell: Point): readonly Point[] {
  const toX = Math.round(toCell.x)
  const toY = Math.round(toCell.y)
  let x = Math.round(fromCell.x)
  let y = Math.round(fromCell.y)

  const spanX = Math.abs(toX - x)
  const spanY = Math.abs(toY - y)
  // `NaN` loses every comparison the walk makes, so it would never reach its end — refused here
  // rather than left to hang the renderer.
  const span = Math.max(spanX, spanY)
  if (!Number.isFinite(span) || span >= MAX_LINE_CELLS) return []

  const towardsX = x < toX ? 1 : -1
  const towardsY = y < toY ? 1 : -1
  const cells: Point[] = [{ x, y }]
  let error = spanX - spanY

  while (x !== toX || y !== toY) {
    const doubled = error * 2
    if (doubled > -spanY) {
      error -= spanY
      x += towardsX
    }
    if (doubled < spanX) {
      error += spanX
      y += towardsY
    }
    cells.push({ x, y })
  }
  return cells
}

/** One cell of the grid, in document pixels. */
export function cellRect(at: Point, cell: number): Rect {
  return { x: at.x * cell, y: at.y * cell, width: cell, height: cell }
}

/** A filled walk is quadratic: 2048 a side costs 323 ms of the UI thread, 4096 costs 2 415 ms. */
const MAX_RECT_CELLS = 4_194_304

/**
 * The cells of a rectangle between two corners, its outline alone unless `filled`. Ordered by
 * row, so what a caller reads back is what it would have written. Empty past the ceiling, as a
 * line is past its own — the corners come from a caller and nothing else bounds them.
 */
export function cellsOfRect(from: Point, to: Point, filled: boolean): Point[] {
  const left = Math.min(from.x, to.x)
  const right = Math.max(from.x, to.x)
  const top = Math.min(from.y, to.y)
  const bottom = Math.max(from.y, to.y)
  if (!Number.isFinite(left + right + top + bottom)) return []

  // An outline costs its PERIMETER, not its area: scanning the inside to throw it away made a
  // hollow 4096 a side cost the sixteen million steps of a filled one to emit sixteen thousand.
  const wide = right - left + 1
  const high = bottom - top + 1
  if ((filled ? wide * high : 2 * (wide + high)) > MAX_RECT_CELLS) return []

  const cells: Point[] = []
  for (let y = top; y <= bottom; y += 1) {
    if (filled || y === top || y === bottom) {
      for (let x = left; x <= right; x += 1) cells.push({ x, y })
      continue
    }
    cells.push({ x: left, y })
    if (right !== left) cells.push({ x: right, y })
  }
  return cells
}

/** Under this a hairline covers a sixth of the gap, and the grid reads as a grey wash. */
export const MIN_GRID_PX = 6

export function gridIsLegible(step: number, scale: number): boolean {
  return step * scale >= MIN_GRID_PX
}
