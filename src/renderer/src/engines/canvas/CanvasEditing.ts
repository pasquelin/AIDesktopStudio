import { orElse } from '@shared/promises'
import { Assets, Container, Graphics, Rectangle, Sprite } from 'pixi.js'
import { assetUrl } from '@shared/domain/asset'
import { bytesToBase64 } from '@shared/base64'
import { reportFailure } from '@/services/diagnostics'
import {
  allLayers,
  layerById,
  type Rect,
  type ShapeKind,
  type Transform,
  WHITE,
} from './canvasState'
import { type CanvasSelection, type SelectionShape } from './canvasSelection'
import { maskKey } from './compositor'
import type { Point, Size } from '../core/geometry'
import { surfaceTransform } from './canvasEngineSupport1'
import type { LayerSurface, PaintSurface, LayerPixels } from './canvasEngineSupport1'
import { released } from './canvasEngineSupport2'
import { CanvasPixels } from './CanvasPixels'

export abstract class CanvasEditing extends CanvasPixels {
  protected abstract documentRect(): Rect | null

  protected abstract place(target: Container, transform: Transform, box: Size): void

  protected abstract render(): void

  /**
   * A layer's mask, alone, as the API wants it: white where the model may paint. It is the same
   * texture the brush writes into — the mask one paints is the mask one regenerates.
   */
  async maskSnapshot(layerId: string): Promise<string | null> {
    const mask = this.surfaces.get(maskKey(layerId))
    const frame = this.documentRect()
    if (!mask || !frame) return null

    // Rendered through a holder, and that is the whole of the fix: Pixi REPLACES the local
    // transform of whatever it is handed as the root, so extracting the sprite itself dropped
    // the placement `place` had put on it — the mask arrived at the origin while the picture
    // beside it carried its layers' moves, and a moved layer was repainted in the wrong region.
    // A child keeps its own transform, exactly as the layers under `this.world` do.
    // A sprite of its own on the same texture, rather than the stack's: borrowing that one would
    // take it out of the tree, and `reconcile` only puts sprites back when the placement
    // signature changes — which borrowing does not.
    const layer = this.state ? layerById(this.state, layerId) : null
    const placed = new Sprite(mask.texture)
    if (layer) this.place(placed, surfaceTransform(layer, true), mask.texture)

    const holder = new Container()
    holder.addChild(placed)

    const png = await this.pngOf(holder, new Rectangle(frame.x, frame.y, frame.width, frame.height))

    // The texture belongs to the surface, so it does not go with the sprite that borrowed it.
    placed.destroy({ texture: false, textureSource: false })
    holder.destroy()

    return png && bytesToBase64(png)
  }

  /** One layer as the composited tree draws it, including its ancestors, mask and adjustments. */
  async layerSnapshot(layerId: string): Promise<string | null> {
    const surface = this.surfaces.get(layerId)
    const frame = this.documentRect()
    const layer = this.state && layerById(this.state, layerId)
    if (!surface || !frame || !layer || layer.kind === 'group' || layer.kind === 'adjustment') {
      return null
    }

    const visible = new Map<string, boolean>()
    for (const [key, held] of this.surfaces) {
      visible.set(key, held.sprite.renderable)
      held.sprite.renderable = key === layerId || key === maskKey(layerId)
    }

    const restore = (): void => {
      for (const [key, renderable] of visible) {
        const held = this.surfaces.get(key)
        if (held) held.sprite.renderable = renderable
      }
    }
    try {
      const png = await this.pngOf(
        this.world,
        new Rectangle(frame.x, frame.y, frame.width, frame.height),
        restore,
      )
      return png && bytesToBase64(png)
    } finally {
      restore()
    }
  }

  /** White polygons on black, framed like the document the generation will edit. */
  async outlineMaskSnapshot(outlines: readonly (readonly Point[])[]): Promise<string | null> {
    const frame = this.documentRect()
    if (!frame || outlines.length === 0) return null

    const mask = new Graphics()
    mask.rect(frame.x, frame.y, frame.width, frame.height)
    mask.fill({ color: 0x000000 })
    for (const outline of outlines) {
      const first = outline[0]
      if (!first) continue
      mask.moveTo(first.x, first.y)
      for (const point of outline.slice(1)) mask.lineTo(point.x, point.y)
      mask.lineTo(first.x, first.y)
      mask.fill({ color: WHITE })
    }

    const png = await this.pngOf(mask, new Rectangle(frame.x, frame.y, frame.width, frame.height))
    mask.destroy()
    return png && bytesToBase64(png)
  }

  /**
   * Every surface's pixels, for saving the document. The textures rather than the sprites: a
   * surface is document-sized and the transform lives in the state, so extracting a placed
   * sprite would bake in a move `place` applies again on the way back.
   *
   * Keyed by layer rather than by file name — what these are called on disk is the document
   * layer's business, not the engine's.
   */
  async pixelSnapshots(): Promise<LayerPixels[]> {
    if (!this.app?.renderer || !this.state) return []

    const taken: LayerPixels[] = []
    for (const layer of allLayers(this.state.layers)) {
      for (const mask of [false, true]) {
        const surface = this.surfaces.get(mask ? maskKey(layer.id) : layer.id)
        if (!surface) continue
        const data = await this.pngOf(surface.texture)
        // A surface the engine HAS and cannot hand over is a loss, not an absence — the engine
        // going down mid-loop is the ordinary way here. Skipping it wrote the container without
        // that layer and called the save a success.
        if (!data) throw new Error(`Layer ${layer.id} has a surface this engine can no longer read`)
        taken.push({ layerId: layer.id, mask, data })
      }
    }
    return taken
  }

  /**
   * Draws saved pixels back into a layer's surface. Through `loadInto`, which contains what it
   * is given inside the document — a `.png` edited by hand to another size is put back framed
   * rather than spilling over the layers under it.
   */
  async restoreSnapshot(pixels: LayerPixels): Promise<void> {
    const key = pixels.mask ? maskKey(pixels.layerId) : pixels.layerId
    const surface = this.surfaces.get(key)

    // Held rather than dropped when the surface is not there yet: `loadInto` returns in silence
    // on a missing one, and a document would reopen with its stack and none of its pixels. The
    // claim below is then made by the drain, which runs before the surface can reload `source`.
    if (!surface) {
      this.pendingSnapshots.set(key, pixels.data)
      return
    }
    // Marked before the await, so a reload of `source` in flight cannot slip in front of it.
    surface.fromDocument = true
    try {
      await this.loadPixelsInto(key, pixels.data)
    } catch (error) {
      // Given back, and the asset drawn in its place — see `fallBackToSource`.
      this.fallBackToSource(key, surface)
      throw error
    }
  }

  /**
   * Saved pixels into a surface, through a blob URL the loader forgets afterwards.
   *
   * The cache is keyed on the WHOLE source string, so a data URL of a 4K layer would be held for
   * the life of the window — the very megabytes this stopped putting in a string. `unload` and
   * `revokeObjectURL` give the BYTES back; Pixi's resolver keeps its own entry per URL string,
   * which nothing public clears — a few hundred bytes per surface restored, for the session.
   *
   * Cleared, unlike a placed picture: the surface was born filled — white, for the base layer —
   * and compositing over that would bring a hole the user erased back as white rather than as
   * the transparency the file holds.
   */
  protected async loadPixelsInto(key: string, png: Uint8Array<ArrayBuffer>): Promise<void> {
    const url = URL.createObjectURL(new Blob([png], { type: 'image/png' }))
    try {
      await this.loadInto(key, url, true)
    } finally {
      // Given back here already, so `dispose` has nothing left to give back for this one. A blob
      // URL is this engine's alone, so no other holder can be waiting on it.
      if (this.loaded.delete(url)) released(url)
      await orElse(Assets.unload(url), undefined)
      URL.revokeObjectURL(url)
    }
  }

  /** Pours the saved pixels held for a surface into it, once it exists. */
  protected drainPendingSnapshot(key: string, surface: LayerSurface): void {
    const png = this.pendingSnapshots.get(key)
    if (!png) return
    this.pendingSnapshots.delete(key)
    // Claimed BEFORE the load, because the guard in `syncLayer` reads it on the very next line:
    // set on success it would always be too late, and the asset would be drawn over these pixels
    // every time. Given back below if the load turns out not to arrive.
    surface.fromDocument = true
    // Nothing is rethrown: this runs inside `reconcile`, which has nowhere to report to.
    void this.loadPixelsInto(key, png).catch(() => this.fallBackToSource(key, surface))
  }

  /**
   * Draws the asset a layer names, after its own saved pixels failed to.
   *
   * A surface inside the container can be truncated or corrupt, and before the claim existed
   * the layer was drawn from `assetUrl(source)` regardless — so a bad one cost nothing visible.
   * The claim would now leave that layer empty and silent, and the next ⌘S would write the empty
   * layer over the asset. The claim is given back and the asset drawn, which is what it did.
   */
  protected fallBackToSource(key: string, surface: LayerSurface): void {
    surface.fromDocument = false

    const layer = this.state && layerById(this.state, key)
    if (!layer || layer.kind !== 'pixel' || layer.source === undefined) return

    void this.loadInto(key, assetUrl(layer.source)).catch(error =>
      reportFailure('canvas.layer', layer.source ?? key, error),
    )
  }

  /** Rectangle, ellipse or lasso: three gestures behind one tool, as the bar offers them. */
  setSelectionShape(shape: SelectionShape): void {
    this.selectionShape = shape
  }

  /** Rectangle, line, arrow, ellipse, polygon or star — the six the bar offers. */
  setShape(kind: ShapeKind, sides = this.shapeSides): void {
    this.shapeKind = kind
    this.shapeSides = sides
  }

  /**
   * The caption a field is typing elsewhere. Its sprite steps aside for as long as that lasts, so
   * the words are drawn once and by one thing — never twice, half a pixel apart.
   *
   * Session state, like the selection: nothing about the document changes, so `visible` is left
   * alone and ⌘Z gives back no layer nobody hid.
   */
  setEditingText(layerId: string | null): void {
    if (this.editing === layerId) return
    this.editing = layerId
    this.reconcile()
    this.render()
  }

  /** Session state, so React owns it: the engine draws it and clips strokes to it. */
  setSelection(selection: CanvasSelection): void {
    this.selection = selection
    this.overlay.invalidate()
  }

  /**
   * Aims the brush at the layer's pixels or at its mask. A mask is painted with the same tools as
   * anything else — that is the point of it being a surface like the others.
   */
  setPaintTarget(target: PaintSurface): void {
    this.painting = target
  }
}
