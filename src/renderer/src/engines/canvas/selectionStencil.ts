import { Graphics } from 'pixi.js'
import type { Rect } from './canvasState'
import { selectionOutline, type CanvasSelection } from './canvasSelection'

/** Builds the document-space GPU stencil for a pixel-accurate selection. */
export function selectionStencil(selection: CanvasSelection): Graphics | null {
  if (!selection) return null
  const stencil = new Graphics()
  if (!drawSelectionStencil(stencil, selection)) {
    stencil.destroy()
    return null
  }
  return stencil
}

/** Draws a selection into a caller-owned graphics sheet. */
export function drawSelectionStencil(
  stencil: Graphics,
  selection: Exclude<CanvasSelection, null>,
  color = 0xffffff,
): boolean {
  if (selection.kind === 'raster') {
    drawRasterSelection(
      stencil,
      selection.bounds,
      selection.width,
      selection.height,
      selection.alpha,
      color,
    )
    return true
  }

  const outline = selectionOutline(selection)
  const first = outline[0]
  if (!first) return false

  stencil.moveTo(first.x, first.y)
  for (const point of outline.slice(1)) stencil.lineTo(point.x, point.y)
  stencil.fill({ color })
  return true
}

/** Compresses contiguous opaque pixels to one rectangle, rather than one Pixi path per pixel. */
function drawRasterSelection(
  stencil: Graphics,
  bounds: Rect,
  width: number,
  height: number,
  alpha: Uint8Array,
  color: number,
): void {
  if (width <= 0 || height <= 0) return
  const pixelWidth = bounds.width / width
  const pixelHeight = bounds.height / height

  for (let y = 0; y < height; y += 1) {
    let from = -1
    for (let x = 0; x <= width; x += 1) {
      const opaque = x < width && (alpha[y * width + x] ?? 0) > 0
      if (opaque && from < 0) from = x
      if (opaque || from < 0) continue

      drawRasterRun(stencil, bounds, from, x, y, pixelWidth, pixelHeight)
      from = -1
    }
  }
  stencil.fill({ color })
}

function drawRasterRun(
  stencil: Graphics,
  bounds: Rect,
  from: number,
  to: number,
  row: number,
  pixelWidth: number,
  pixelHeight: number,
): void {
  stencil.rect(
    bounds.x + from * pixelWidth,
    bounds.y + row * pixelHeight,
    (to - from) * pixelWidth,
    pixelHeight,
  )
}
