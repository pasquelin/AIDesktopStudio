import { RenderTexture } from 'pixi.js'
import { isEmptySelection, type CanvasSelection } from './canvasSelection'
import { maskKey } from './compositor'
import { type BrushMark } from './CanvasOverlay'
import type { Point } from '../core/geometry'
import { blurRadius, brushSettingsOf, type BrushSettings } from './brush'
import { cellBox, stampRect } from './pixelGrid'
import { toDocument, type Viewport } from './viewport'
import type { LayerSurface } from './canvasEngineSupport1'
import { RINGED_TOOLS } from './canvasEngineSupport2'
import { CanvasViewport } from './CanvasViewport'

export abstract class CanvasBrush extends CanvasViewport {
  protected abstract setCursor(cursor: string): void

  protected abstract shownViewport(): Viewport

  protected abstract paintMask(
    layerId: string,
    mask: LayerSurface,
    selection: CanvasSelection,
  ): void

  protected abstract dropPending(layerId: string): void

  /**
   * Drops what the pointer was over, and repaints without it.
   *
   * Called wherever the box may have moved out from under a still hand — a tool change, the end
   * of a drag, a zoom, a fresh state. The hover is recomputed on the next move rather than
   * guessed at from before: a lit grip that no longer sits under the pointer is worse than none.
   */
  protected forgetHover(): void {
    // The refusal is dropped alongside the grip: a refusing tool holds no chrome, so a guard on
    // the grip alone left `not-allowed` on screen after arming a tool that refuses nothing.
    if (!this.hover && !this.refused) return
    this.hover = null
    this.refused = false
    // Never over a cursor something else owns: a gesture holds its own for as long as it runs —
    // a pan keeps `grabbing` across every frame it moves the view by — and space held is a pan
    // in waiting that `releaseSpace` will give back.
    if (this.gesture.kind === 'none' && !this.spacing) this.setCursor('')
    this.overlay.invalidate()
  }

  setBrush(settings: BrushSettings): void {
    this.brush = settings
    this.tuneSoftener()
    // The ring is drawn from this size: without a repaint it would keep the old footprint until
    // the hand next moved, and a size slider would look disconnected from what it sets.
    if (this.ringed()) this.overlay.invalidate()
  }

  /**
   * How far the edge of a dab is spread, in document pixels — zero for every tool that does not
   * feather.
   *
   * Asked of `brushSettingsOf`, which the bar reads too, so slider and softener cannot drift.
   *
   * The pencil is hard by definition, and that is the whole of what tells it from the brush. The
   * eraser is hard for a reason of Pixi's: a filtered container is drawn into a texture of its
   * own, cleared to nothing, and composed back with the FILTER's blend mode rather than the
   * stamp's — so an `erase` stamp under a filter rubs out against an empty texture and takes
   * nothing away. Softening it would mean moving the blend onto the filter, which no test here
   * can check: there is no GPU under vitest, and this is the one path where being wrong means
   * the eraser silently stops erasing.
   */
  protected softness(): number {
    const feathers = brushSettingsOf(this.tool, this.pixelCell()).includes('hardness')
    return feathers ? blurRadius(this.brush) : 0
  }

  protected pixelCell(): number | null {
    return this.state?.pixelCell ?? null
  }

  /**
   * How far the softened edge reaches past the disc, in SURFACE pixels — which is the space a
   * filter works in. Zero when nothing is hung, so a hard brush records the box it always did.
   */
  protected fringe(): number {
    return this.spread === 0 ? 0 : this.softener.padding
  }

  /**
   * The filter is hung on the stamp only while it has something to do. Left in place at zero
   * strength it would still cost a render pass and a framebuffer bind on every dab of a hard
   * brush, which is the common case.
   */
  protected tuneSoftener(): void {
    const spread = this.softness()
    if (spread === this.spread) return

    this.spread = spread
    if (spread === 0) {
      this.stamp.filters = []
      return
    }

    this.softener.strength = spread
    // Rounded up, and that is what this line is for: Pixi computes the same `strength * 2` and
    // then applies it as `(padding | 0)`, so a fractional spread would lose its last pixel of
    // fringe. Written after `strength`, whose setter recomputes padding from scratch.
    this.softener.padding = Math.ceil(spread * 2)
    this.stamp.filters = [this.softener]
  }

  /**
   * The two corners of a dragged box, on whole cells while the document is on a grid. `cropRect`
   * clamps to the document afterwards, so an edge of a document the cell does not divide lands
   * on the document's own edge rather than on a boundary.
   */
  protected gridBox(from: Point, to: Point): { from: Point; to: Point } {
    const cell = this.pixelCell()
    return cell === null ? { from, to } : cellBox(from, to, cell)
  }

  /** What the next dab covers, which on a grid is a square and not the disc the size names. */
  protected brushMark(at: Point): BrushMark {
    const cell = this.pixelCell()
    if (cell === null) return { radius: this.brush.size / 2 }
    return { stamp: stampRect(toDocument(this.shownViewport(), at), cell, this.brush.size) }
  }

  /** Whether the armed tool stamps a disc, and so whether the ring stands for anything. */
  protected ringed(): boolean {
    return RINGED_TOOLS.has(this.tool)
  }

  /**
   * Fills a layer's mask with the selection: what is inside stays visible, everything else is
   * hidden. The mask and the inpainting mask are the same object, so this is also how a region
   * becomes something to regenerate.
   *
   * The layer must already carry a mask — the command that gives it one runs on the React side,
   * and the surface follows on the next `apply`.
   */
  fillMaskFromSelection(layerId: string): void {
    const renderer = this.app?.renderer
    const mask = this.surfaces.get(maskKey(layerId))
    const selection = this.selection
    if (!selection || isEmptySelection(selection) || !renderer || !this.state) return

    if (!mask) {
      // The command that gives the layer its mask has only just been run: the surface follows
      // on the next `apply`, one React commit later. Held until then rather than dropped.
      this.pendingMaskFills.set(layerId, selection)
      return
    }

    this.paintMask(layerId, mask, selection)
  }

  /**
   * Composes the whole stack into one picture and holds it for the layer that is about to replace
   * it. Called BEFORE `flatten` runs: once the command has run the stack is gone, and with it
   * every texture the picture is made of.
   *
   * The layer it is held for does not exist yet — the command that creates it runs on the React
   * side, and its surface follows on the next `apply`. Same shape as `fillMaskFromSelection`.
   */
  flattenInto(layerId: string): void {
    const renderer = this.app?.renderer
    if (!renderer || !this.state) return

    const picture = RenderTexture.create({
      width: this.state.width,
      height: this.state.height,
      resolution: 1,
    })

    // The world carries pan and zoom, which are session state and have no business in a picture:
    // flattening at 40 % would otherwise bake a document four fifths empty.
    const { x, y } = this.world.position
    const scale = this.world.scale.x
    this.world.position.set(0, 0)
    this.world.scale.set(1)
    renderer.render({ container: this.world, target: picture, clear: true })
    this.world.position.set(x, y)
    this.world.scale.set(scale)

    this.dropPending(layerId)
    this.pendingPictures.set(layerId, picture)
  }
}
