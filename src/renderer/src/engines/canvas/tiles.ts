import { clamp } from '@shared/numeric'
import type { Rect } from './canvasState'
import type { Size } from '../core/geometry'

/**
 * The grid pixel edits are recorded on. A full snapshot per history entry is what this exists to
 * avoid: fifty undo steps of a 4096² document would be three gigabytes, where fifty brush strokes
 * touch a handful of tiles each.
 *
 * 512 is the usual compromise — small enough that a dab books half a megabyte, large enough that
 * flooding a whole layer books tens of textures rather than thousands.
 */
export const TILE_SIZE = 512

/** One cell of the grid, already clipped to the document: `width` and `height` are its real size. */
export type Tile = {
  column: number
  row: number
  x: number
  y: number
  width: number
  height: number
}

export function tileKey(tile: Tile): string {
  return `${tile.column},${tile.row}`
}

/** RGBA, one byte a channel — what a tile of this size costs on the GPU. */
export function tileBytes(tile: Tile): number {
  return tile.width * tile.height * 4
}

/**
 * The tiles a rectangle touches, clipped to the document. A stroke runs off the frame all the
 * time — half a dab past the edge is the ordinary case — and a tile outside it holds no pixel to
 * put back.
 */
export function tilesCovering(rect: Rect, document: Size): Tile[] {
  const left = clamp(Math.min(rect.x, rect.x + rect.width), 0, document.width)
  const top = clamp(Math.min(rect.y, rect.y + rect.height), 0, document.height)
  const right = clamp(Math.max(rect.x, rect.x + rect.width), 0, document.width)
  const bottom = clamp(Math.max(rect.y, rect.y + rect.height), 0, document.height)

  if (right <= left || bottom <= top) return []

  const tiles: Tile[] = []
  const lastColumn = Math.floor((right - 1) / TILE_SIZE)
  const lastRow = Math.floor((bottom - 1) / TILE_SIZE)

  for (let row = Math.floor(top / TILE_SIZE); row <= lastRow; row += 1) {
    for (let column = Math.floor(left / TILE_SIZE); column <= lastColumn; column += 1) {
      const x = column * TILE_SIZE
      const y = row * TILE_SIZE
      tiles.push({
        column,
        row,
        x,
        y,
        width: Math.min(TILE_SIZE, document.width - x),
        height: Math.min(TILE_SIZE, document.height - y),
      })
    }
  }
  return tiles
}

/** The box a set of points covers once the brush is spread around each of them. */
export function brushRect(points: readonly { x: number; y: number }[], radius: number): Rect {
  const first = points[0]
  if (!first) return { x: 0, y: 0, width: 0, height: 0 }

  let left = first.x
  let top = first.y
  let right = first.x
  let bottom = first.y

  for (const point of points) {
    left = Math.min(left, point.x)
    top = Math.min(top, point.y)
    right = Math.max(right, point.x)
    bottom = Math.max(bottom, point.y)
  }

  // One pixel of slack for the antialiased rim, which reaches past the geometric radius.
  const reach = radius + 1
  return {
    x: left - reach,
    y: top - reach,
    width: right - left + reach * 2,
    height: bottom - top + reach * 2,
  }
}

/** The one box a set of boxes falls in. */
export function unionOf(rects: readonly Rect[]): Rect {
  const first = rects[0]
  if (!first) return { x: 0, y: 0, width: 0, height: 0 }

  let left = first.x
  let top = first.y
  let right = first.x + first.width
  let bottom = first.y + first.height

  for (const rect of rects) {
    left = Math.min(left, rect.x)
    top = Math.min(top, rect.y)
    right = Math.max(right, rect.x + rect.width)
    bottom = Math.max(bottom, rect.y + rect.height)
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Whether two boxes share any area at all. Touching edges do not. */
export function overlaps(one: Rect, other: Rect): boolean {
  return (
    one.x < other.x + other.width &&
    other.x < one.x + one.width &&
    one.y < other.y + other.height &&
    other.y < one.y + one.height
  )
}

/**
 * One box per row of `rects`, rather than one over them all. A diagonal set's own union is the
 * whole document, and every tile handed to the patch store is photographed — enough to evict
 * the entries of older strokes out of the history.
 */
export function rowBoxes(rects: readonly Rect[]): Rect[] {
  const rows = new Map<number, Rect[]>()
  for (const rect of rects) {
    const row = rows.get(rect.y)
    if (row) row.push(rect)
    else rows.set(rect.y, [rect])
  }
  return [...rows.values()].map(unionOf)
}

/**
 * The same box, opened by a margin on all four sides.
 *
 * Beside `brushRect` because it is the second half of the same question: what a stroke covers is
 * its discs, plus whatever a filter spreads past them — and the two are counted in different
 * spaces, so they cannot be added before the first has been mapped.
 */
export function grownBy(rect: Rect, margin: number): Rect {
  if (margin <= 0) return rect

  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  }
}
