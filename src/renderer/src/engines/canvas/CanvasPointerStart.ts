import { type Layer, type Rect, type TextLayer } from './canvasState'
import { dragSelection, type CanvasSelection } from './canvasSelection'
import { type Affine } from './layerSpace'
import { centerOf, type HandleHit } from './handles'
import { type Axis } from './guides'
import type { Point } from '../core/geometry'
import { toDocument } from './viewport'
import { UNBUILT_TOOLS, sizeOf } from './canvasEngineSupport1'
import type { LayerSurface, BrushTarget } from './canvasEngineSupport1'
import type { HoverBox } from './canvasEngineSupport2'
import { isSmartTool } from './canvasTool'
import { CanvasHitArea } from './CanvasHitArea'

export abstract class CanvasPointerStart extends CanvasHitArea {
  protected abstract capture(event: PointerEvent): void

  protected abstract endGesture(dropped?: unknown): void

  protected abstract setCursor(cursor: string): void

  protected abstract grabGuide(point: Point): { id: string; axis: Axis } | null

  protected abstract pick(point: Point): void

  protected abstract paintTarget(): BrushTarget | null

  protected abstract beginPixels(target: BrushTarget): Rect

  protected abstract fill(surface: LayerSurface, color: number, clip?: Affine): void

  protected abstract endPixels(): void

  protected abstract activeLayer(): Layer | null

  protected abstract hoverBox(): HoverBox | null

  protected abstract chromeAt(box: HoverBox, point: Point): HandleHit | null

  protected abstract frameOf(layer: Layer): Rect

  protected abstract captionAt(point: Point): TextLayer | null

  protected abstract setCropping(rect: Rect | null): void

  protected abstract publishSelection(selection: CanvasSelection): void

  protected abstract dab(target: BrushTarget, points: readonly Point[]): void

  protected readonly onPointerDown = (event: PointerEvent): void => {
    // A panel can be dragged or a sidebar collapsed without the host resizing; the start of a
    // gesture is the one moment where a stale rectangle would be felt as an offset stroke.
    this.bounds = this.host?.getBoundingClientRect() ?? this.bounds
    const host = this.toHost(event)
    const point = toDocument(this.shownViewport(), host)
    this.pointer = host

    // Held from here to `endGesture`, so a drag that leaves the panel keeps being followed.
    if (event.button === 0 || event.button === 1) this.capture(event)

    // Middle button pans whatever the tool: it is the one gesture no tool may take over. It can
    // land mid-drag, so whatever was open is closed rather than abandoned — a guide gesture left
    // open would make the next drag of that guide re-create it instead of moving it. A crop frame
    // is untouched by this: it is not a gesture, and panning to see it is the point.
    if (event.button === 1 || this.spacing || this.tool === 'hand') {
      this.endGesture()
      this.gesture = { kind: 'pan', from: host }
      this.setCursor('grabbing')
      return
    }
    if (event.button !== 0) return

    if (this.startGuide(host, point)) return
    this.startTool(event, point)
  }

  private startGuide(host: Point, point: Point): boolean {
    const band = this.inRuler(host)
    if (band === 'corner') return true
    const grabbed = band === null ? this.grabGuide(point) : null
    if (band === null && !grabbed) return false
    const axis = band ?? grabbed?.axis
    if (!axis) return false
    const position = band ? this.snapped(axis === 'x' ? point.x : point.y, axis) : undefined
    this.options.guides.beginDrag()
    this.gesture = {
      kind: 'guide',
      id: grabbed?.id ?? this.options.guides.add(axis, position ?? 0),
      axis,
    }
    return true
  }

  private startTool(event: PointerEvent, point: Point): void {
    if (this.tool === 'picker') return this.pick(point)
    if (this.tool === 'comment') {
      this.gesture = { kind: 'comment', at: point, points: [point] }
      return
    }
    if (this.tool === 'fill') return this.startFill()
    if (UNBUILT_TOOLS.has(this.tool)) return
    if (this.tool === 'move') return this.startMove(point)
    if (this.tool === 'text') return this.startText(event, point)
    if (this.tool === 'shape')
      this.gesture = { kind: 'shape', origin: point, from: point, to: point }
    else if (this.tool === 'crop') this.startCrop(point)
    else if (this.tool === 'select') {
      this.gesture = { kind: 'select', from: point }
      this.publishSelection(dragSelection(this.selectionShape, point, point, false))
    } else if (isSmartTool(this.tool)) {
      this.gesture = { kind: this.tool, from: point, to: point }
    } else this.startPaint(point)
  }

  private startFill(): void {
    const target = this.paintTarget()
    if (!target) return
    this.patches?.touch(this.beginPixels(target))
    this.fill(target.surface, this.brush.color, target.toSurface)
    this.endPixels()
    this.render()
  }

  private startMove(point: Point): void {
    const layer = this.activeLayer()
    if (!layer || layer.locked.position) return
    const frame = this.hoverBox()
    const hit = frame && this.chromeAt(frame, point)
    this.options.layers.beginDrag()
    if (frame && hit) {
      this.gesture =
        hit.kind === 'handle'
          ? { kind: 'handle', id: layer.id, handle: hit.id, from: point, origin: layer.transform }
          : {
              kind: 'rotate',
              id: layer.id,
              center: centerOf(frame.corners),
              from: point,
              origin: layer.transform,
            }
      return
    }
    this.gesture = {
      kind: 'move',
      id: layer.id,
      from: point,
      origin: { x: layer.transform.x, y: layer.transform.y },
    }
  }

  private startText(event: PointerEvent, point: Point): void {
    const armed = this.activeLayer()
    const frame = this.hoverBox()
    const grip = frame && this.chromeAt(frame, point)
    if (armed?.kind === 'text' && frame && grip)
      return this.startTextGrip(armed, frame, grip, point)
    if (event.metaKey && armed?.kind === 'text') {
      this.options.layers.beginDrag()
      this.gesture = {
        kind: 'move',
        id: armed.id,
        from: point,
        origin: { x: armed.transform.x, y: armed.transform.y },
      }
      return
    }
    const caption = this.captionAt(point)
    if (caption) this.options.onText({ layerId: caption.id })
    else this.gesture = { kind: 'text', from: point, to: point }
  }

  private startTextGrip(armed: TextLayer, frame: HoverBox, grip: HandleHit, point: Point): void {
    this.options.layers.beginDrag()
    this.gesture =
      grip.kind === 'handle'
        ? {
            kind: 'textBox',
            id: armed.id,
            handle: grip.id,
            box: armed.box ?? sizeOf(this.frameOf(armed)),
            origin: armed.transform,
          }
        : {
            kind: 'rotate',
            id: armed.id,
            center: centerOf(frame.corners),
            from: point,
            origin: armed.transform,
          }
  }

  private startCrop(point: Point): void {
    const frame = this.hoverBox()
    const grip = frame && this.chromeAt(frame, point)
    if (this.cropping && grip)
      this.gesture = { kind: 'cropHandle', handle: grip.id, origin: this.cropping }
    else {
      this.setCropping(null)
      this.overlay.invalidate()
      this.gesture = { kind: 'crop', from: point }
    }
  }

  private startPaint(point: Point): void {
    const target = this.paintTarget()
    if (!target) return
    this.beginPixels(target)
    this.gesture = { kind: 'paint', from: point, target }
    this.dab(target, [point])
  }
}
