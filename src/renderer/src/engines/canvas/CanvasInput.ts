import { type Container, Graphics } from 'pixi.js'
import { isTyping } from '@/helpers/typing'
import { onPixelGrid } from './canvasState'
import { isEmptySelection } from './canvasSelection'
import { maskKey } from './compositor'
import { type Affine } from './layerSpace'
import { cornersOfRect, hitTest, HANDLE_GRAB, ROTATE_REACH, type HandleHit } from './handles'
import { UPRIGHT } from './cursors'
import type { Point } from '../core/geometry'
import { wheelStep, toDocument, zoomCanvasAt } from './viewport'
import type { LayerSurface } from './canvasEngineSupport1'
import { NO_GESTURE, LAYER_DRAGS, sameHit, cursorFor } from './canvasEngineSupport2'
import type { HoverBox } from './canvasEngineSupport2'
import { CanvasPointerTracking } from './CanvasPointerTracking'

export abstract class CanvasInput extends CanvasPointerTracking {
  protected abstract commitShape(from: Point, to: Point): void

  protected abstract commitText(from: Point, to: Point): void

  protected abstract clipped(container: Container): Container

  /** Closes whatever gesture is open, exactly once, whether it ended or was taken over. */
  protected endGesture(dropped = false): void {
    const gesture = this.gesture
    this.gesture = NO_GESTURE
    this.release()

    if (gesture.kind === 'guide') {
      if (dropped) this.options.guides.remove(gesture.id)
      this.options.guides.endDrag()
      this.overlay.invalidate()
      return
    }

    // One history entry per gesture: a command per dab, or per pointer move, would make ⌘Z useless.
    if (LAYER_DRAGS.has(gesture.kind)) this.options.layers.endDrag()
    if (gesture.kind === 'paint') this.endPixels()
    if (gesture.kind === 'shape') this.commitShape(gesture.from, gesture.to)
    if (gesture.kind === 'text') this.commitText(gesture.from, gesture.to)
    if (gesture.kind === 'smartSelectBox') this.smartBox(gesture.from, gesture.to)
    if (gesture.kind === 'comment') {
      this.options.onComment(gesture.at, gesture.points.length > 2 ? gesture.points : undefined)
      this.overlay.invalidate()
    }
    // A click that carved nothing out is how every editor deselects. Left standing, a zero-area
    // selection is a stencil nothing gets through, and the document stops taking paint at all.
    if (gesture.kind === 'select' && isEmptySelection(this.selection)) this.publishSelection(null)
  }

  private smartBox(from: Point, to: Point): void {
    const box = this.gridBox(from, to)
    this.options.onSmartSelect({
      box: {
        x: box.from.x,
        y: box.from.y,
        width: box.to.x - box.from.x,
        height: box.to.y - box.from.y,
      },
    })
  }

  /**
   * What an idle pointer is over, and what the cursor says about it. Repaints only when the
   * answer changed: a hand resting on the canvas must not buy a frame of overlay per event.
   *
   * Space held wins over everything — it is a pan in waiting, and `releaseSpace` gives the
   * cursor back.
   */
  protected hovering(host: Point): void {
    const box = this.spacing ? null : this.hoverBox()
    const next = box && this.chromeAt(box, toDocument(this.shownViewport(), host))
    // Weighed alongside the grip, never behind it: a refusing tool holds no chrome, so both
    // hits compare equal on every move and a test on the grip alone would return before the
    // refusal was ever read.
    const refused = !this.spacing && this.refuses()
    if (sameHit(next, this.hover) && refused === this.refused) return

    this.hover = next
    this.refused = refused
    // The refusal wins over a grip: a padlocked layer still draws its box, and an arrow over one
    // would promise a pull the press declines.
    if (!this.spacing) {
      this.setCursor(refused ? 'not-allowed' : box && next ? cursorFor(next, box.facing) : '')
    }
    this.overlay.invalidate()
  }

  /**
   * The chrome a press or a hover may take hold of — the armed layer's box, or the crop frame.
   * Never both: the two tools that draw grips are mutually exclusive.
   *
   * A crop does not turn the document, so its rotation ring has no reach at all. Spelling that as
   * a zero rather than as a second code path is what keeps the frame's grips and the layer's
   * answering to one hit test.
   */
  protected hoverBox(): HoverBox | null {
    if (this.tool === 'crop') {
      return this.cropping
        ? { corners: cornersOfRect(this.cropping), reach: 0, facing: UPRIGHT }
        : null
    }

    const corners = this.activeCorners()
    const facing = this.activeLayer()?.transform
    if (!corners || !facing) return null
    return { corners, reach: ROTATE_REACH, facing }
  }

  /** Both tolerances are screen pixels, so a grip stays as easy to take at 5% as at 800%. */
  protected chromeAt(box: HoverBox, point: Point): HandleHit | null {
    const scale = this.view.viewport.scale
    return hitTest(box.corners, point, HANDLE_GRAB / scale, box.reach / scale)
  }

  protected readonly onPointerLeave = (): void => {
    this.pointer = null
    this.forgetHover()
  }

  protected readonly onKeyDown = (event: KeyboardEvent): void => {
    // A space typed into a prompt is a space, not a pan.
    if (event.code !== 'Space' || event.repeat || isTyping(event.target)) return
    this.spacing = true
    this.setCursor('grab')
  }

  protected readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') this.releaseSpace()
  }

  /** ⌘Tab while space is held: the key up never arrives, and the hand cursor would stay for good. */
  protected readonly onBlur = (): void => this.releaseSpace()

  protected releaseSpace(): void {
    this.spacing = false
    if (this.gesture.kind === 'pan') return

    this.setCursor('')
    // What the pointer was over was left standing while space held the cursor. Dropped rather
    // than kept: the hover is only recomputed when it *changes*, so a grip the hand never left
    // would compare equal on the next move and its arrow would never come back. Same for the
    // refusal, which is weighed the same way.
    this.hover = null
    this.refused = false
    this.overlay.invalidate()
  }

  protected setCursor(cursor: string): void {
    // On Pixi's canvas rather than the host: React owns the host's cursor, and the canvas fills
    // it, so this wins for as long as the gesture lasts and gives it back on release.
    if (this.app) this.app.canvas.style.cursor = cursor
  }

  /**
   * Trackpads send a pinch as a wheel with `ctrlKey`, which is also how ⌘/Ctrl + wheel arrives:
   * both mean zoom. A bare wheel scrolls, as it does in Figma — the document moves under a still
   * pointer instead of jumping a zoom step per notch.
   */
  protected readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    const viewport = this.view.viewport

    if (event.ctrlKey || event.metaKey) {
      // Once per wheel event rather than once per gesture: a zoom has no pointer down to refresh
      // the rectangle, and a panel moved without resizing would anchor it next to the cursor.
      this.bounds = this.host?.getBoundingClientRect() ?? this.bounds
      const host = this.toHost(event)

      if (onPixelGrid(this.state)) {
        const stepped = wheelStep(viewport.scale, this.wheelDebt, event.deltaY)
        this.wheelDebt = stepped.debt
        if (stepped.scale !== viewport.scale) {
          this.moveTo(zoomCanvasAt(viewport, stepped.scale, host))
        }
        return
      }

      // Exponential, so a notch feels the same at 5% and at 800%.
      this.moveTo(zoomCanvasAt(viewport, viewport.scale * Math.exp(-event.deltaY / 250), host))
      return
    }

    this.moveTo({ ...viewport, x: viewport.x - event.deltaX, y: viewport.y - event.deltaY })
  }

  /**
   * Paints a surface edge to edge. `clip` is the bucket's way back into the pixels, and its
   * presence is what makes the fill stop at the selection; a surface being born never does — a
   * mask born white inside a marquee and transparent outside would hide its layer everywhere
   * else the moment it appeared. A pixel grid changes nothing here: edge to edge is aligned.
   */
  protected fill(surface: LayerSurface, color: number, clip?: Affine): void {
    const renderer = this.app?.renderer
    if (!renderer || !this.state) return

    const sheet = new Graphics()
    // The document's own rectangle when the bucket draws it, since the stencil beside it is cut
    // in document space; the texture's when a surface is being born, which has no stencil and
    // must come out filled corner to corner whatever its layer's transform is.
    const box = clip ? this.state : surface.texture
    sheet.rect(0, 0, box.width, box.height)
    sheet.fill({ color })

    const container = clip ? this.inSurfaceSpace(clip, this.clipped(sheet)) : sheet
    renderer.render({ container, target: surface.texture, clear: false })
    sheet.destroy()
  }

  /** Where the brush writes on the active layer: its own pixels, or the mask that hides them. */
  protected activeSurface(): LayerSurface | null {
    const id = this.state?.activeLayerId
    return id ? (this.surfaces.get(this.paintKey(id)) ?? null) : null
  }

  protected paintKey(layerId: string): string {
    return this.painting === 'mask' ? maskKey(layerId) : layerId
  }
}
