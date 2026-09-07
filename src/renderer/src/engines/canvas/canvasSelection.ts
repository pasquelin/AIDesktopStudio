import type { Rect } from './canvasState'
import { box, ELLIPSE_SEGMENTS } from './shapeGeometry'
import type { Point } from '../core/geometry'

/**
 * The region a gesture carved out, in document coordinates.
 *
 * Session state, never part of `CanvasState`: a selection is how one is looking at a document,
 * not something one made of it, and ⌘Z must not give a marquee back.
 */
export type CanvasSelection =
  | { kind: 'rect'; rect: Rect }
  | { kind: 'ellipse'; rect: Rect }
  | { kind: 'lasso'; points: readonly Point[] }
  | RasterSelection
  | null

/** A pixel-accurate temporary selection in document coordinates. */
export type RasterSelection = {
  kind: 'raster'
  bounds: Rect
  width: number
  height: number
  alpha: Uint8Array
}

/** Which shape each mode of the region group draws. */
export type SelectionShape = 'rect' | 'ellipse' | 'lasso'

/**
 * The selection a drag between two points makes. `square` is the shift key: a rectangle becomes
 * a square and an ellipse a circle, as they do everywhere else.
 */
export function dragSelection(
  shape: SelectionShape,
  from: Point,
  to: Point,
  square: boolean,
): CanvasSelection {
  if (shape === 'lasso') return { kind: 'lasso', points: [from, to] }
  return { kind: shape, rect: box(from, to, square) }
}

/** A lasso grows a point at a time; the rest is a box between two corners. */
export function extendLasso(selection: CanvasSelection, point: Point): CanvasSelection {
  if (selection?.kind !== 'lasso') return selection
  return { kind: 'lasso', points: [...selection.points, point] }
}

/**
 * The outline to stroke, in document coordinates and closed — one shape for the three, so the
 * overlay strokes a polyline and needs to know nothing about ellipses or lassos.
 */
export function selectionOutline(selection: CanvasSelection): Point[] {
  if (!selection) return []
  if (selection.kind === 'lasso') return [...selection.points]
  if (selection.kind === 'raster') return rasterOutline(selection)

  const rect = selection.rect
  if (selection.kind === 'rect') {
    return [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ]
  }

  const radiusX = rect.width / 2
  const radiusY = rect.height / 2
  return Array.from({ length: ELLIPSE_SEGMENTS }, (_, step) => {
    const angle = (step / ELLIPSE_SEGMENTS) * Math.PI * 2
    return {
      x: rect.x + radiusX * (1 + Math.cos(angle)),
      y: rect.y + radiusY * (1 + Math.sin(angle)),
    }
  })
}

function rasterOutline(selection: Extract<CanvasSelection, { kind: 'raster' }>): Point[] {
  const { bounds, width, height } = selection
  const horizontal = bounds.width / width
  const vertical = bounds.height / height
  const edges = rasterEdges(selection)

  const first = edges.entries().next().value
  if (!first) return []
  const [start, point] = first
  const [startX, startY] = start.split(':').map(Number)
  if (startX === undefined || startY === undefined) return []
  const outline = [{ x: bounds.x + startX * horizontal, y: bounds.y + startY * vertical }]
  let at = point
  edges.delete(start)
  while (edges.size > 0) {
    outline.push(at)
    const x = Math.round((at.x - bounds.x) / horizontal)
    const y = Math.round((at.y - bounds.y) / vertical)
    const next = edges.get(rasterKey(x, y))
    if (!next) break
    edges.delete(rasterKey(x, y))
    at = next
  }
  return outline
}

function rasterEdges(selection: RasterSelection): Map<string, Point> {
  const edges = new Map<string, Point>()
  for (let y = 0; y < selection.height; y += 1) {
    for (let x = 0; x < selection.width; x += 1) {
      addRasterEdges(edges, selection, x, y)
    }
  }
  return edges
}

function addRasterEdges(
  edges: Map<string, Point>,
  selection: RasterSelection,
  x: number,
  y: number,
): void {
  if (!rasterOpaqueAt(selection, x, y)) return
  if (!rasterOpaqueAt(selection, x, y - 1)) addRasterEdge(edges, selection, x, y, x + 1, y)
  if (!rasterOpaqueAt(selection, x + 1, y)) addRasterEdge(edges, selection, x + 1, y, x + 1, y + 1)
  if (!rasterOpaqueAt(selection, x, y + 1)) addRasterEdge(edges, selection, x + 1, y + 1, x, y + 1)
  if (!rasterOpaqueAt(selection, x - 1, y)) addRasterEdge(edges, selection, x, y + 1, x, y)
}

function rasterOpaqueAt(selection: RasterSelection, x: number, y: number): boolean {
  return (
    x >= 0 &&
    y >= 0 &&
    x < selection.width &&
    y < selection.height &&
    (selection.alpha[y * selection.width + x] ?? 0) > 0
  )
}

function addRasterEdge(
  edges: Map<string, Point>,
  selection: RasterSelection,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): void {
  const horizontal = selection.bounds.width / selection.width
  const vertical = selection.bounds.height / selection.height
  edges.set(rasterKey(fromX, fromY), {
    x: selection.bounds.x + toX * horizontal,
    y: selection.bounds.y + toY * vertical,
  })
}

function rasterKey(x: number, y: number): string {
  return `${x}:${y}`
}

/**
 * Whether a selection encloses nothing at all — a click that carved no region, or a lasso that
 * never moved. Left standing, such a selection is a stencil nothing gets through, and every
 * later stroke writes nothing while looking exactly like a bug in the brush.
 */
export function isEmptySelection(selection: CanvasSelection): boolean {
  if (!selection) return false
  if (selection.kind === 'lasso') return selection.points.length < 3
  if (selection.kind === 'raster') return !selection.alpha.some(alpha => alpha > 0)

  return selection.rect.width === 0 || selection.rect.height === 0
}

/** The box a selection fits in, which is what a brush stroke is clipped against first. */
export function selectionBounds(selection: CanvasSelection): Rect | null {
  if (!selection) return null
  if (selection.kind === 'raster') return selection.bounds
  if (selection.kind !== 'lasso') return selection.rect

  const xs = selection.points.map(point => point.x)
  const ys = selection.points.map(point => point.y)
  if (xs.length === 0) return null

  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }
}

/** Whether a point falls inside. A lasso is closed on the fly: the last point joins the first. */
export function selectionHolds(selection: CanvasSelection, point: Point): boolean {
  if (!selection) return true

  if (selection.kind === 'raster') return rasterHolds(selection, point)

  if (selection.kind === 'rect') {
    const { rect } = selection
    return (
      point.x >= rect.x &&
      point.y >= rect.y &&
      point.x <= rect.x + rect.width &&
      point.y <= rect.y + rect.height
    )
  }

  if (selection.kind === 'ellipse') {
    const { rect } = selection
    const radiusX = rect.width / 2
    const radiusY = rect.height / 2
    if (radiusX === 0 || radiusY === 0) return false

    const dx = (point.x - (rect.x + radiusX)) / radiusX
    const dy = (point.y - (rect.y + radiusY)) / radiusY
    return dx * dx + dy * dy <= 1
  }

  return windsAround(selection.points, point)
}

function rasterHolds(selection: RasterSelection, point: Point): boolean {
  const { bounds, width, height, alpha } = selection
  if (width <= 0 || height <= 0 || bounds.width <= 0 || bounds.height <= 0) return false

  const x = Math.floor(((point.x - bounds.x) / bounds.width) * width)
  const y = Math.floor(((point.y - bounds.y) / bounds.height) * height)
  if (x < 0 || y < 0 || x >= width || y >= height) return false

  return (alpha[y * width + x] ?? 0) > 0
}

/**
 * Ray casting: a point is inside when a ray from it crosses the outline an odd number of times.
 * Chosen over the winding number because it needs no orientation — a lasso is drawn whichever
 * way the hand went.
 */
function windsAround(points: readonly Point[], point: Point): boolean {
  let inside = false

  for (let at = 0, previous = points.length - 1; at < points.length; previous = at, at += 1) {
    const a = points[at]
    const b = points[previous]
    if (!a || !b) continue

    const straddles = a.y > point.y !== b.y > point.y
    if (!straddles) continue
    // Where the edge crosses the ray's height, compared with the point's own x.
    if (point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }

  return inside
}
