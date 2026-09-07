import { Rectangle } from 'pixi.js'
import { allLayers, isGroup, type TextLayer } from './canvasState'
import { applyTo, invert, layerMatrix } from './layerSpace'
import { box, localShape } from './shapeGeometry'
import type { Point } from '../core/geometry'
import { onCellBoundary } from './pixelGrid'
import { strokeWidth, MIN_TEXT_DRAG } from './canvasEngineSupport1'
import { CanvasSelectionDrawing } from './CanvasSelectionDrawing'

export class CanvasPicking extends CanvasSelectionDrawing {
  /** Crops the document to the frame on screen, in the one order the three steps work in. */
  applyCrop(): void {
    const rect = this.cropping
    if (!rect) return

    this.setCropping(null)
    this.overlay.invalidate()
    // A marquee is in document coordinates and the crop moves the picture under it: left
    // standing it would stencil the wrong pixels, or none at all once the frame stops reaching
    // it — and the brush would go silently dead.
    this.publishSelection(null)
    // The pixels before the state: `resurface` recuts every surface to the kept region, so the
    // `apply` the command triggers finds them already the right size and leaves them alone.
    this.resurface({ width: rect.width, height: rect.height }, rect)
    this.options.onCrop(rect)
  }

  /** Takes the frame off screen without cropping anything. */
  dropCrop(): void {
    if (!this.cropping) return
    this.setCropping(null)
    this.overlay.invalidate()
  }

  /**
   * The caption's box, once the hand comes up. A drag too small to have been meant as one opens
   * the default box instead, which is what makes a plain click work.
   */
  protected commitText(from: Point, to: Point): void {
    this.textBox = null
    this.overlay.invalidate()

    const drawn = box(from, to, false)
    const dragged = drawn.width >= MIN_TEXT_DRAG && drawn.height >= MIN_TEXT_DRAG
    this.options.onText(
      dragged
        ? { at: { x: drawn.x, y: drawn.y }, box: { width: drawn.width, height: drawn.height } }
        : // A plain click opens a POINT caption: no box, no wrapping, and its line simply grows.
          { at: from, box: null },
    )
  }

  /** The topmost caption whose box holds the point — what a click with the text tool edits. */
  protected captionAt(point: Point): TextLayer | null {
    const size = this.documentSize()
    for (const layer of allLayers(this.state?.layers ?? []).reverse()) {
      if (layer.kind !== 'text' || !layer.visible) continue

      const back = invert(layerMatrix(layer.transform, size))
      if (!back) continue

      // The frame answers for both kinds: a paragraph is its box, a point caption is its words.
      const frame = this.frameOf(layer)
      const local = applyTo(back, point)
      const inside =
        local.x >= frame.x &&
        local.y >= frame.y &&
        local.x <= frame.x + frame.width &&
        local.y <= frame.y + frame.height
      if (inside) return layer
    }
    return null
  }

  /**
   * Hands the drawn shape over as a LAYER, once, when the hand comes up — rasterizing it into the
   * armed layer would make the fill of a rectangle drawn an hour ago something only undo can fix.
   */
  protected commitShape(from: Point, to: Point): void {
    const drawn = this.pending
    this.pending = null
    this.overlay.invalidate()
    if (!drawn) return

    const line = drawn.kind === 'line' || drawn.kind === 'arrow'
    const width = strokeWidth(this.brush.size)
    const local = localShape(this.shapeKind, from, to, this.shapeSides, line ? width : 0)
    const cell = this.pixelCell()

    // A ring places its vertices by `cos`/`sin`, so the box the outline gives back is fractional
    // even between two corners on the grid — and a layer placed on a fraction resamples.
    this.options.onShape(cell === null ? local.at : onCellBoundary(local.at, cell), {
      shape: this.shapeKind,
      from: local.from,
      to: local.to,
      sides: this.shapeSides,
      fill: line ? null : this.brush.color,
      stroke: line ? { color: this.brush.color, width } : null,
    })
  }

  protected pick(point: Point): void {
    const renderer = this.app?.renderer
    const layer = this.activeLayer()
    const surface = this.activeSurface()
    if (!renderer || !layer || isGroup(layer) || !surface) return

    // A sprite's frame is read in its TEXTURE's space, not the document's — the same conversion
    // every other pixel gesture makes. Read straight from the document, the eyedropper answered
    // for a texel the cursor was nowhere near as soon as the layer had been moved or scaled.
    const toSurface = invert(this.surfaceMatrix(layer, false, surface))
    if (!toSurface) return

    const local = applyTo(toSurface, point)
    const x = Math.floor(local.x)
    const y = Math.floor(local.y)
    if (x < 0 || y < 0 || x >= surface.texture.width || y >= surface.texture.height) return
    const pixels = renderer.extract.pixels({
      target: surface.sprite,
      frame: new Rectangle(x, y, 1, 1),
    })

    if (pixels.pixels.length > 3 && pixels.pixels[3] === 0) return

    const red = pixels.pixels[0] ?? 0
    const green = pixels.pixels[1] ?? 0
    const blue = pixels.pixels[2] ?? 0
    this.options.onPick((red << 16) | (green << 8) | blue)
  }
}
