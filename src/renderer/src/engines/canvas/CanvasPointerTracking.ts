import { layerById, type Rect } from './canvasState'
import { dragSelection, extendLasso } from './canvasSelection'
import { applyTo, invert, layerMatrix } from './layerSpace'
import { resizeBy, resizedBox, rotateBy } from './handles'
import { cropRect, resizeCrop } from './crop'
import { box, constrainedTo, shapeGeometry } from './shapeGeometry'
import type { Point } from '../core/geometry'
import { onCellBoundary } from './pixelGrid'
import { toDocument } from './viewport'
import type { BrushTarget } from './canvasEngineSupport1'
import { CanvasPainting } from './CanvasPainting'
import { GENERATION_COMMENT_OUTLINE_MAX } from '@shared/domain/generationComment'

export abstract class CanvasPointerTracking extends CanvasPainting {
  protected abstract hovering(host: Point): void

  protected abstract stroke(target: BrushTarget, from: Point, to: Point): void

  protected abstract setCropping(rect: Rect | null): void

  protected abstract endGesture(dropped?: unknown): void

  protected readonly onPointerMove = (event: PointerEvent): void => {
    const host = this.toHost(event)
    this.pointer = host
    // Two things follow the pointer without a gesture: the rulers echo it, and the brush ring
    // rides on it. Either one makes an idle move cost one overlay frame; neither armed, and it
    // costs none.
    if (this.view.rulers || this.ringed()) this.overlay.invalidate()

    const gesture = this.gesture
    if (gesture.kind === 'none') return this.hovering(host)

    if (gesture.kind === 'pan') return this.trackPan(gesture.from, host)

    // Every remaining gesture works in document space; the pan is the only one that does not,
    // and an idle hover — the common case — must not pay for the conversion at all.
    this.trackDocumentGesture(gesture, toDocument(this.shownViewport(), host), event.shiftKey)
  }

  private trackDocumentGesture(
    gesture: Exclude<typeof this.gesture, { kind: 'none' | 'pan' }>,
    point: Point,
    constrained: boolean,
  ): void {
    switch (gesture.kind) {
      case 'guide':
        return this.trackGuide(gesture, point)
      case 'move':
        return this.trackMove(gesture, point)
      case 'select':
        return this.trackSelection(gesture, point, constrained)
      case 'smartSelectBox':
        gesture.to = point
        return
      case 'comment':
        if (gesture.points.length < GENERATION_COMMENT_OUTLINE_MAX) gesture.points.push(point)
        else gesture.points[gesture.points.length - 1] = point
        this.overlay.invalidate()
        return
      case 'paint':
        return this.trackPaint(gesture, point)
      case 'handle':
        return this.trackHandle(gesture, point, constrained)
      default:
        return this.trackDrawingGesture(gesture, point, constrained)
    }
  }

  private trackDrawingGesture(
    gesture: Extract<
      typeof this.gesture,
      { kind: 'rotate' | 'crop' | 'cropHandle' | 'shape' | 'text' | 'textBox' }
    >,
    point: Point,
    constrained: boolean,
  ): void {
    switch (gesture.kind) {
      case 'rotate':
        return this.trackRotate(gesture, point, constrained)
      case 'crop':
        return this.trackCrop(gesture, point, constrained)
      case 'cropHandle':
        return this.trackCropHandle(gesture, point, constrained)
      case 'shape':
        return this.trackShape(gesture, point, constrained)
      case 'text':
        return this.trackText(gesture, point)
      case 'textBox':
        return this.trackTextBox(gesture, point, constrained)
    }
  }

  private trackPan(from: Point, host: Point): void {
    const viewport = this.view.viewport
    this.moveTo({ ...viewport, x: viewport.x + host.x - from.x, y: viewport.y + host.y - from.y })
    this.gesture = { kind: 'pan', from: host }
  }

  private trackGuide(gesture: Extract<typeof this.gesture, { kind: 'guide' }>, point: Point): void {
    const raw = gesture.axis === 'x' ? point.x : point.y
    this.options.guides.move(gesture.id, this.snapped(raw, gesture.axis))
  }

  private trackMove(gesture: Extract<typeof this.gesture, { kind: 'move' }>, point: Point): void {
    const to = this.snappedMove(gesture.origin, gesture.from, point)
    this.options.layers.translate(gesture.id, to.x, to.y)
  }

  private trackPaint(gesture: Extract<typeof this.gesture, { kind: 'paint' }>, point: Point): void {
    this.stroke(gesture.target, gesture.from, point)
    this.gesture = { kind: 'paint', from: point, target: gesture.target }
  }

  private trackRotate(
    gesture: Extract<typeof this.gesture, { kind: 'rotate' }>,
    point: Point,
    constrained: boolean,
  ): void {
    const next = rotateBy(gesture.origin, gesture.center, gesture.from, point, constrained)
    this.options.layers.transform(gesture.id, next)
  }

  private trackText(gesture: Extract<typeof this.gesture, { kind: 'text' }>, point: Point): void {
    gesture.to = point
    this.textBox = box(gesture.from, point, false)
    this.overlay.invalidate()
  }

  private trackSelection(
    gesture: Extract<typeof this.gesture, { kind: 'select' }>,
    point: Point,
    additive: boolean,
  ): void {
    const carved = this.gridBox(gesture.from, point)
    this.publishSelection(
      this.selectionShape === 'lasso'
        ? extendLasso(this.selection, point)
        : dragSelection(this.selectionShape, carved.from, carved.to, additive),
    )
  }

  private trackCrop(
    gesture: Extract<typeof this.gesture, { kind: 'crop' }>,
    point: Point,
    constrained: boolean,
  ): void {
    const framed = this.gridBox(gesture.from, point)
    this.setCropping(cropRect(framed.from, framed.to, this.documentSize(), constrained))
    this.overlay.invalidate()
  }

  private trackHandle(
    gesture: Extract<typeof this.gesture, { kind: 'handle' }>,
    point: Point,
    constrained: boolean,
  ): void {
    const held = this.state && layerById(this.state, gesture.id)
    if (!held) return
    const next = resizeBy(
      gesture.origin,
      gesture.handle,
      this.documentSize(),
      point,
      constrained,
      this.frameOf(held),
    )
    this.options.layers.transform(gesture.id, next)
  }

  private trackCropHandle(
    gesture: Extract<typeof this.gesture, { kind: 'cropHandle' }>,
    point: Point,
    constrained: boolean,
  ): void {
    const cell = this.pixelCell()
    const pulled = cell === null ? point : onCellBoundary(point, cell)
    const next = resizeCrop(
      gesture.origin,
      gesture.handle,
      pulled,
      this.documentSize(),
      constrained,
    )
    if (next) this.setCropping(next)
    this.overlay.invalidate()
  }

  private trackShape(
    gesture: Extract<typeof this.gesture, { kind: 'shape' }>,
    point: Point,
    constrained: boolean,
  ): void {
    const drawn = this.gridBox(gesture.origin, point)
    gesture.from = drawn.from
    gesture.to = constrainedTo(this.shapeKind, drawn.from, drawn.to, constrained)
    this.pending = shapeGeometry(this.shapeKind, gesture.from, gesture.to, {
      sides: this.shapeSides,
      constrain: false,
    })
    this.overlay.invalidate()
  }

  private trackTextBox(
    gesture: Extract<typeof this.gesture, { kind: 'textBox' }>,
    point: Point,
    constrained: boolean,
  ): void {
    const matrix = layerMatrix(gesture.origin, this.documentSize())
    const back = invert(matrix)
    if (!back) return
    const next = resizedBox(gesture.handle, gesture.box, applyTo(back, point), constrained)
    const shifted = applyTo({ ...matrix, tx: 0, ty: 0 }, next)
    this.options.onTextBox(
      gesture.id,
      { width: next.width, height: next.height },
      { x: gesture.origin.x + shifted.x, y: gesture.origin.y + shifted.y },
    )
  }

  protected readonly onPointerUp = (event: PointerEvent): void => {
    // Whatever is still held down keeps the gesture open: a right button let go during a drag
    // used to close it, and a guide let go over the canvas was thrown away by the ruler test.
    if (event.buttons !== 0) return

    // The corner counts: a guide dropped anywhere on the chrome is a guide thrown away.
    const onChrome = this.inRuler(this.toHost(event)) !== null
    this.forgetHover()
    this.endGesture(onChrome)
  }

  /**
   * Makes the panel the one thing this pointer talks to, so a drag that leaves it goes on being
   * followed. Without it the moves stop at the edge and the gesture commits wherever it was last
   * seen INSIDE — dragging a layer, a marquee or a crop grip to the border was impossible.
   *
   * Only a real pointer: a synthesised event names an id no browser is tracking, and asking to
   * capture it throws. The gesture runs either way, it just stops following the hand.
   */
  protected capture(event: PointerEvent): void {
    if (!event.isTrusted) return

    this.host?.setPointerCapture(event.pointerId)
    this.captured = event.pointerId
  }

  protected release(): void {
    if (this.captured !== null) this.host?.releasePointerCapture(this.captured)
    this.captured = null
  }
}
