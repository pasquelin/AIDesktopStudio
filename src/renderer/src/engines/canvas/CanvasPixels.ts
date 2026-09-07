import { type Container, Graphics, Rectangle, Sprite, type Texture } from 'pixi.js'
import { bytesToBase64 } from '@shared/base64'
import { layerById, type Layer, type Rect, WHITE } from './canvasState'
import { drawSelectionStencil } from './selectionStencil'
import type { CanvasSelection } from './canvasSelection'
import { compose, invert, type Affine } from './layerSpace'
import { BLEND_BY_MODE, bitmapSourceOf, blobOf } from './canvasEngineSupport1'
import type { LayerSurface } from './canvasEngineSupport1'
import { CanvasBrush } from './CanvasBrush'

export abstract class CanvasPixels extends CanvasBrush {
  protected abstract surfaceMatrix(layer: Layer, mask: boolean, surface: LayerSurface): Affine

  protected abstract inSurfaceSpace(toSurface: Affine, content: Container): Container

  protected abstract render(): void

  protected abstract documentRect(): Rect | null

  /**
   * Draws one layer's pixels into the one below it, before `mergeDown` drops it from the stack.
   * The lower layer keeps its own texture — that is what the command records — so this is the
   * only moment the upper one's pixels can be saved.
   *
   * Both surfaces already exist, so nothing is held back: the picture is composed straight away.
   * The upper layer is carried through the document and back into the lower layer's own pixels,
   * which is what makes a merge right when either of them has been moved or turned.
   */
  mergeInto(belowId: string, aboveId: string): void {
    const renderer = this.app?.renderer
    const state = this.state
    const below = this.surfaces.get(belowId)
    const above = this.surfaces.get(aboveId)
    if (!renderer || !state || !below || !above) return

    const aboveLayer = layerById(state, aboveId)
    const belowLayer = layerById(state, belowId)
    if (!aboveLayer || !belowLayer) return

    const toBelow = invert(this.surfaceMatrix(belowLayer, false, below))
    if (!toBelow) return

    const carried = new Sprite(above.texture)
    // What the eye saw of the upper layer, which is what a merge promises to keep.
    carried.alpha = aboveLayer.opacity * aboveLayer.fillOpacity
    carried.blendMode = BLEND_BY_MODE[aboveLayer.blend]

    const placement = compose(toBelow, this.surfaceMatrix(aboveLayer, false, above))
    renderer.render({
      container: this.inSurfaceSpace(placement, carried),
      target: below.texture,
      clear: false,
    })
    carried.destroy({ texture: false, textureSource: false })
    this.render()
  }

  /** A picture held for a layer that never arrived, or that is being replaced by a newer one. */
  protected dropPending(layerId: string): void {
    const held = this.pendingPictures.get(layerId)
    if (!held) return
    this.pendingPictures.delete(layerId)
    held.destroy(true)
  }

  /** Pours the picture held for a layer into the surface it was waiting for. */
  protected drainPendingPicture(layerId: string, surface: LayerSurface): void {
    const renderer = this.app?.renderer
    const picture = this.pendingPictures.get(layerId)
    if (!renderer || !picture) return

    this.pendingPictures.delete(layerId)
    const carried = new Sprite(picture)
    renderer.render({ container: carried, target: surface.texture, clear: true })
    carried.destroy({ texture: false, textureSource: false })
    picture.destroy(true)
    this.render()
  }

  protected paintMask(layerId: string, mask: LayerSurface, selection: CanvasSelection): void {
    const renderer = this.app?.renderer
    const layer = this.state && layerById(this.state, layerId)
    if (!renderer || !selection || !layer || !this.state) return

    // The outline is where the marquee was drawn, in the document; the mask's pixels are its own.
    // Without the way back, a mask made from a selection on a moved layer hides the wrong region.
    const toSurface = invert(this.surfaceMatrix(layer, true, mask))
    if (!toSurface) return

    const sheet = new Graphics()
    // Black over the whole document, then the region in white: the mask reads its red channel,
    // so black hides and white reveals, exactly as painting into it by hand does.
    sheet.rect(0, 0, this.state.width, this.state.height)
    sheet.fill({ color: 0x000000 })
    drawSelectionStencil(sheet, selection, WHITE)

    renderer.render({
      container: this.inSurfaceSpace(toSurface, sheet),
      target: mask.texture,
      clear: true,
    })
    sheet.destroy()
    this.render()
  }

  /**
   * A mask that has just come into existence takes the region it was asked for. Kept as the
   * outline rather than as "the current selection": what a click meant must not change because
   * the pointer moved between the command and the frame that built the surface.
   */
  protected drainPendingMask(layerId: string, mask: LayerSurface): void {
    const selection = this.pendingMaskFills.get(layerId)
    if (!selection) return

    this.pendingMaskFills.delete(layerId)
    this.paintMask(layerId, mask, selection)
  }

  /**
   * The whole document as one picture — the flatten `mergedimage.png` holds, and what every
   * other application draws of a `.ora`.
   *
   * Extracted rather than composited by hand: the world IS the composited tree, and the GPU has
   * it. Through a canvas and a blob rather than a data URL, so the bytes are never a string.
   */
  async flatten(): Promise<Uint8Array<ArrayBuffer> | null> {
    const frame = this.documentRect()
    if (!frame || !this.state) return null

    return await this.pngOf(this.world, new Rectangle(frame.x, frame.y, frame.width, frame.height))
  }

  /**
   * The same picture, NOT encoded — for a consumer inside this window rather than a file.
   *
   * Measured on this machine at 2048²: encoding the PNG takes 1029 ms, wrapping the very same
   * canvas as an `ImageBitmap` takes 0.3. That gap is the whole reason a live preview is
   * affordable and a save on a timer is not.
   */
  async flattenBitmap(): Promise<ImageBitmap | null> {
    const frame = this.documentRect()
    const renderer = this.app?.renderer
    if (!frame || !this.state || !renderer) return null

    const drawn = bitmapSourceOf(
      renderer.extract.canvas({
        target: this.world,
        frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
        resolution: 1,
      }),
    )
    return drawn && (await createImageBitmap(drawn))
  }

  /**
   * The same picture as base64. What an edit sends to the API, which takes the payload alone —
   * a `data:image/png;base64,` reaching it is part of the picture.
   */
  async snapshot(): Promise<string | null> {
    const png = await this.flatten()
    return png && bytesToBase64(png)
  }

  /**
   * A target rendered to PNG bytes.
   *
   * `resolution: 1` and never the renderer's, which is the display scale: the same document
   * would otherwise be extracted at 1024² from one screen and 2048² from another.
   */
  protected async pngOf(
    target: Container | Texture,
    frame?: Rectangle,
    onExtracted?: () => void,
  ): Promise<Uint8Array<ArrayBuffer> | null> {
    const renderer = this.app?.renderer
    // `null` for an engine that is not up yet, which every caller already treats as "not ready".
    if (!renderer) return null

    const canvas = renderer.extract.canvas({
      target,
      ...(frame ? { frame } : {}),
      resolution: 1,
    })
    onExtracted?.()
    const blob = await blobOf(canvas)
    /**
     * THROWS rather than answering nothing, and the difference is a document.
     *
     * `extract.base64` rejected here, so a surface that would not encode failed the whole ⌘S and
     * left the tab dirty. Answering `null` instead, the save wrote the container WITHOUT that
     * surface — the container is replaced whole — and then marked the document clean. A layer
     * gone, silently, on a save that looked like it worked.
     */
    if (!blob) throw new Error('the renderer would not encode this surface')
    return new Uint8Array(await blob.arrayBuffer())
  }
}
