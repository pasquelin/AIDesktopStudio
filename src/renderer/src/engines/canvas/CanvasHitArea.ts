import { type Container, RenderTexture, Sprite } from 'pixi.js'
import { reportFailure } from '@/services/diagnostics'
import { captionsSetIn, faceUrlOf } from './canvasFonts'
import { type TextLayer, type Transform } from './canvasState'
import { type Affine } from './layerSpace'
import { RULER_SIZE } from './CanvasOverlay'
import { boxEdges, snapOffset, snapTargets, SNAP_TOLERANCE, type Axis } from './guides'
import { type PatchSide } from './PixelPatches'
import type { Point, Size } from '../core/geometry'
import { onCellBoundary } from './pixelGrid'
import { toDocument } from './viewport'
import type { LayerSurface } from './canvasEngineSupport1'
import { bytesOf } from './canvasEngineSupport2'
import { CanvasLayerDrawing } from './CanvasLayerDrawing'

export abstract class CanvasHitArea extends CanvasLayerDrawing {
  protected abstract fill(surface: LayerSurface, color: number, clip?: Affine): void

  protected abstract captionAt(point: Point): TextLayer | null

  /**
   * Puts an embedded face in the page, and redraws every caption set in it.
   *
   * Once per family, whatever asks: a document of twenty captions in one font must not fetch it
   * twenty times, and a face already in the page is one `drawText` needs nothing more from. That
   * one fetch is why the landing sweeps the document instead of the caption that happened to ask —
   * the other nineteen were turned away at the early return, and no landing of their own is coming.
   */
  protected async registerFace(layer: TextLayer): Promise<void> {
    const url = faceUrlOf(layer.font)
    const family = layer.font.family
    if (!url || this.faces.has(family)) return

    this.faces.add(family)
    try {
      await this.options.addFace(family, url)
    } catch (error) {
      // Kept in the set: retrying on every reconciliation would fetch a file that is not there
      // once per frame. The caption stays in the generic, and the failure is said once.
      reportFailure('font.face', family, error)
      return
    }

    // Looked up rather than held: only the caption that asked came with a surface. `reconcile`
    // syncs every caption in the tree, so the guard below is the map's type, not a case in the wild.
    for (const caption of captionsSetIn(this.state, family)) {
      const surface = this.surfaces.get(caption.id)
      if (surface) this.drawText(surface, caption)
    }
  }

  /** A document-sized texture and the sprite that shows it, built once and kept. */
  protected buildSurface(key: string, fill?: number): LayerSurface | null {
    const existing = this.surfaces.get(key)
    if (existing) return existing

    // Nothing is built before the renderer exists: a texture allocated against no GPU context
    // would take a stroke and never show it. `mount` replays the state.
    if (!this.app || !this.state) return null

    // A layer coming back from an undo takes its own pixels again. Only when the surface still
    // matches the frame: one held across a crop or a turn holds the sides the document dropped.
    const held = this.departed.get(key)
    if (held) {
      // Its bytes leave the pool with it, or `kept` only ever climbs: a dozen merge-then-undo
      // cycles then put it past the budget with `departed` empty, and the next departure evicts
      // the surface it was just handed — the layer comes back blank, which is the whole defect.
      this.kept -= bytesOf(held.texture)
      this.departed.delete(key)
      if (held.texture.width === this.state.width && held.texture.height === this.state.height) {
        this.surfaces.set(key, held)
        return held
      }
      held.sprite.destroy()
      held.texture.destroy(true)
    }

    const texture = RenderTexture.create({
      width: this.state.width,
      height: this.state.height,
      resolution: 1,
    })
    // Attached by `attach`, which is the only place that knows which container holds it.
    const surface: LayerSurface = { texture, sprite: new Sprite(texture), fromDocument: false }
    this.surfaces.set(key, surface)

    if (fill !== undefined) this.fill(surface, fill)
    return surface
  }

  /**
   * Read from the state, never written from here: a node nudged in place is a position the next
   * `apply` throws away and no undo ever hears about.
   */
  protected place(target: Container, transform: Transform, box: Size): void {
    // The origin is a fraction of the box, so a resize leaves the pivot where it was.
    const pivotX = transform.originX * box.width
    const pivotY = transform.originY * box.height

    target.pivot.set(pivotX, pivotY)
    // A pivot displaces the node by itself: without this, moving the origin of an otherwise
    // untouched layer would slide it across the document.
    target.position.set(transform.x + pivotX, transform.y + pivotY)
    target.rotation = transform.rotation
    target.scale.set(transform.scaleX, transform.scaleY)
    target.skew.set(transform.skewX, transform.skewY)
  }

  /**
   * Paints one end of a recorded gesture back into its layer. Called by the history, which holds
   * the patch id and nothing else — the tiles themselves never leave this side of the line.
   *
   * `false` says the tiles are gone: the caller must drop the entry rather than show a ⌘Z that
   * quietly does nothing.
   */
  restorePixels(patchId: string, side: PatchSide): boolean {
    const patches = this.patches
    const surfaceId = patches?.surfaceOf(patchId)
    const surface = surfaceId ? this.surfaces.get(surfaceId) : null
    if (!patches || !surface) return false

    const done = patches.restore(patchId, side, surface.texture)
    if (done) this.render()
    return done
  }

  /**
   * Host-relative screen pixels — the space the overlay draws in. The rectangle is the cached
   * one: reading it per event forces a layout, and it is refreshed on resize and on every
   * pointer down, which is what every gesture starts with.
   */
  // `MouseEvent`, which pointer, wheel and double-click events all are: only the two client
  // coordinates every one of them carries are read here.
  protected toHost(event: MouseEvent): Point {
    const bounds = this.bounds
    if (!bounds) return { x: 0, y: 0 }
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  }

  /**
   * Which band the point is in, `'corner'` for the square where they meet, `null` for the canvas.
   * The corner is inert but it is still chrome: without it a click there left a brush dab, and
   * the bucket filled the whole layer.
   */
  protected inRuler(point: Point): Axis | 'corner' | null {
    if (!this.view.rulers) return null
    if (point.x >= RULER_SIZE && point.y >= RULER_SIZE) return null
    // The top band lays horizontal guides, which are pinned on the y axis, and the reverse for
    // the left one.
    if (point.x < RULER_SIZE && point.y < RULER_SIZE) return 'corner'
    return point.y < RULER_SIZE ? 'y' : 'x'
  }

  /**
   * Where a dragged layer wants to land. Both of its sides and its middle are candidates on each
   * axis, so it sticks to a guide by whichever edge reaches it first — the same magnetism the
   * guides themselves have, applied to a box rather than to a line.
   */
  protected snappedMove(origin: Point, from: Point, to: Point): Point {
    const raw = { x: origin.x + to.x - from.x, y: origin.y + to.y - from.y }
    // 🛑 Before the guides, and whatever the magnetism says: a layer moved half a pixel makes the
    // sprite's transform resample the whole artwork, and that is invisible until it cannot be
    // undone. The grid is the mode, not a preference — so a layer that arrived off it is pulled
    // ON, absolute rather than by its delta, at the price of moving before the hand does.
    const cell = this.pixelCell()
    if (cell !== null) return onCellBoundary(raw, cell)

    const state = this.state
    if (!this.view.snap || !state) return raw

    const tolerance = SNAP_TOLERANCE / this.view.viewport.scale
    return {
      x: raw.x + snapOffset(boxEdges(raw.x, state.width), snapTargets(state, 'x'), tolerance),
      y: raw.y + snapOffset(boxEdges(raw.y, state.height), snapTargets(state, 'y'), tolerance),
    }
  }

  /** Magnetism is a screen-space feeling: the tolerance shrinks in document units as you zoom. */
  protected snapped(value: number, axis: Axis): number {
    if (!this.view.snap || !this.state) return value
    return (
      value +
      snapOffset([value], snapTargets(this.state, axis), SNAP_TOLERANCE / this.view.viewport.scale)
    )
  }

  /**
   * A double click on the words edits them, the reflex Photoshop answers to and the only way into
   * a caption without arming the text tool first. On `dblclick` and not on `pointerdown`, whose
   * `detail` a pointer event leaves at 0 — measured in Electron, where the count lives on the
   * mouse events the browser sends beside it.
   */
  protected readonly onDoubleClick = (event: MouseEvent): void => {
    if (this.tool !== 'move') return

    this.bounds = this.host?.getBoundingClientRect() ?? this.bounds
    const point = toDocument(this.shownViewport(), this.toHost(event))
    // The ARMED caption only: this tool moves what is armed and nothing here can arm a layer, so
    // opening another would leave the type panel on a third. A padlocked POSITION still edits.
    const caption = this.captionAt(point)
    if (caption && caption.id === this.state?.activeLayerId) {
      this.options.onText({ layerId: caption.id })
    }
  }
}
