import { Graphics } from 'pixi.js'
import { isGroup, isRedrawn, layerById, type Layer, type Rect } from './canvasState'
import { selectionBounds, type CanvasSelection } from './canvasSelection'
import { invert, mapRect, type Affine } from './layerSpace'
import { layerCornersOf, wholeOf, type Corners } from './handles'
import { shapeBounds } from './shapeGeometry'
import type { Size } from '../core/geometry'
import { grownBy, overlaps, rowBoxes } from './tiles'
import { shapeOf } from './canvasEngineSupport1'
import type { LayerSurface, BrushTarget } from './canvasEngineSupport1'
import { WRITING_TOOLS } from './canvasEngineSupport2'
import { CanvasPointerStart } from './CanvasPointerStart'

export abstract class CanvasInteraction extends CanvasPointerStart {
  protected abstract beginPixels(target: BrushTarget): Rect

  protected abstract ink(sheet: Graphics, color: number | null, alpha: number): void

  protected abstract commit(target: BrushTarget, covered: readonly Rect[], sheet: Graphics): void

  protected abstract endPixels(): void

  protected abstract activeSurface(): LayerSurface | null

  protected abstract surfaceMatrix(layer: Layer, mask: boolean, surface: LayerSurface): Affine

  protected abstract paintKey(layerId: string): string

  /**
   * Moved locally and told to React once a frame, exactly as the viewport is: routing every
   * pointer move through the store and back would put a React commit between the gesture and
   * the marquee it draws.
   */
  protected publishSelection(selection: CanvasSelection): void {
    this.selection = selection
    this.overlay.invalidate()

    this.publishingSelection = { selection }
    if (this.selectionFrame === 0) {
      this.selectionFrame = requestAnimationFrame(this.publishSelected)
    }
  }

  protected readonly publishSelected = (): void => {
    this.selectionFrame = 0
    const pending = this.publishingSelection
    this.publishingSelection = null
    if (pending) this.options.onSelection(pending.selection)
  }

  protected activeLayer(): Layer | null {
    return this.state ? layerById(this.state, this.state.activeLayerId) : null
  }

  protected documentSize(): Size {
    return { width: this.state?.width ?? 0, height: this.state?.height ?? 0 }
  }

  /**
   * The rect a layer's grips describe: what its content really occupies, in its own space.
   *
   * `contents` knows it for a photo, which `containIn` shrank and centred — its surface is mostly
   * transparent margin, and gripping that is gripping nothing. A caption and a shape carry it in
   * their own state. Only pixels painted by hand can reach every corner of the document.
   */
  protected frameOf(layer: Layer): Rect {
    // A PARAGRAPH is framed by its box and not by its words: what outgrows it is hidden, and a
    // frame drawn on the words would sit around what nobody can see.
    if (layer.kind === 'text' && layer.box) return { x: 0, y: 0, ...layer.box }

    const laid = this.contents.get(layer.id)
    if (laid) return laid
    if (layer.kind === 'shape') return shapeBounds(shapeOf(layer), layer.stroke?.width ?? 0)
    return wholeOf(this.documentSize())
  }

  /** `null` for a group, which has no texture of its own and so no box to grab. */
  protected cornersOf(layer: Layer): Corners | null {
    if (!this.state || isGroup(layer)) return null
    return layerCornersOf(layer.transform, this.documentSize(), this.frameOf(layer))
  }

  /**
   * The corners of the armed layer, when there is one a grip may be taken on. Memoised on the
   * tree's identity and the armed id: an idle hover would otherwise flatten the layer tree twice
   * per pointer move, and pay for every layer in the document to answer about one.
   */
  protected activeCorners(): Corners | null {
    // The text tool shows them too: a caption whose box is never drawn is a box nobody can aim
    // at, resize, or even tell apart from the words that spill out of it.
    if (this.tool !== 'move' && this.tool !== 'text') return null
    if (this.corners.of === this.state && this.corners.tool === this.tool) return this.corners.box

    const layer = this.activeLayer()
    // The text tool shows the box of a CAPTION and of nothing else: the frame of a pixel layer
    // is the whole document, which says nothing about where the next click would type.
    const drawable = this.tool === 'text' ? layer?.kind === 'text' : true
    const box = layer && drawable && !layer.locked.position ? this.cornersOf(layer) : null
    this.corners = { of: this.state, tool: this.tool, box }
    return box
  }

  /**
   * Whether the armed tool can do nothing at all where the hand is — a group or an adjustment
   * layer under the brush, a padlock on the pixels, a layer pinned under the move tool.
   *
   * Answered by the very test the gesture will run, never by a copy of it: a cursor that
   * promises a stroke the press then refuses is worse than no cursor at all.
   */
  protected refuses(): boolean {
    const cached = this.refusal
    if (
      cached &&
      cached.of === this.state &&
      cached.tool === this.tool &&
      cached.painting === this.painting
    ) {
      return cached.value
    }

    const value = this.wouldRefuse()
    this.refusal = { of: this.state, tool: this.tool, painting: this.painting, value }
    return value
  }

  protected wouldRefuse(): boolean {
    if (this.tool === 'move') {
      const layer = this.activeLayer()
      return !layer || layer.locked.position
    }

    return WRITING_TOOLS.has(this.tool) && this.paintTarget() === null
  }

  /**
   * The same target, resolved by ID and synchronously — what a call needs. Arming a layer and
   * painting on it in one turn cannot wait for the state to come back down through React.
   *
   * Through `paintTarget`, so every refusal is asked of the one function that knows them all;
   * and always at the PIXELS, since which surface the bar happens to aim at is a state of the
   * hand, and a call that names a layer must not dig its mask instead.
   */
  protected paintTargetOf(layerId: string | null): BrushTarget | null {
    const state = this.state
    if (layerId === null || !state) return this.paintTarget()

    const painting = this.painting
    this.state = { ...state, activeLayerId: layerId }
    this.painting = 'pixels'
    try {
      return this.paintTarget()
    } finally {
      // The same OBJECT, not an equal one: `refuses` caches on its identity.
      this.state = state
      this.painting = painting
    }
  }

  /**
   * Cells painted in one pass and ONE history entry, whatever their number. A null colour erases
   * them. `null` for a layer that refuses the paint — see `paintTargetOf`.
   */
  paintCells(layerId: string | null, rects: readonly Rect[], color: number | null): boolean {
    // 🛑 A stroke is in flight, and `patches.begin` throws away whatever is open: the trait would
    // lose its tiles, end with no history entry at all, and leave its pixels on the surface.
    if (this.gesture.kind === 'paint' || rects.length === 0) return false

    const target = this.paintTargetOf(layerId)
    if (!target) return false
    // A marquee cuts the pass, so cells wholly outside it change nothing — and an entry that
    // changes nothing is a ⌘Z the user watches do something invisible. Its BOX only: a rect
    // inside the box of an ellipse but outside the ellipse still poses one.
    const marquee = selectionBounds(this.selection)
    if (marquee && !rects.some(rect => overlaps(rect, marquee))) return false

    this.beginPixels(target)
    const sheet = new Graphics()
    for (const rect of rects) sheet.rect(rect.x, rect.y, rect.width, rect.height)
    this.ink(sheet, color, 1)
    // One box PER ROW, not one over the whole set: `unionOf` on a diagonal line is the document,
    // and `PixelPatches` photographs every tile it is handed — enough to evict the entries of
    // older strokes out of the history.
    this.commit(
      target,
      rowBoxes(rects).map(box => grownBy(mapRect(target.toSurface, box), 1)),
      sheet,
    )
    sheet.destroy()
    this.endPixels()
    return true
  }

  /** The surface a stroke may land on: armed, able to hold pixels, and not padlocked. */
  protected paintTarget(): BrushTarget | null {
    const layer = this.activeLayer()
    if (!layer || isGroup(layer) || layer.locked.pixels) return null
    // Its own pixels only: a caption and a shape are redrawn WHOLE whenever anything about them
    // changes, so a stroke laid on one would be wiped with no history entry to bring it back —
    // recolouring a rectangle would take the paint over it away. Their masks are never redrawn.
    if (isRedrawn(layer) && this.painting !== 'mask') return null

    const surface = this.activeSurface()
    // No surface means the layer carries no mask while the brush aims at one: there is nothing
    // to paint, and nothing to say about it either.
    if (!surface) return null

    // A layer crushed onto a line has no way back from the document to its pixels. Declining the
    // stroke is the only safe answer: painting through a singular map writes NaN over the whole
    // texture, and no undo brings those back.
    const toSurface = invert(this.surfaceMatrix(layer, this.painting === 'mask', surface))
    return toSurface ? { key: this.paintKey(layer.id), surface, toSurface } : null
  }
}
