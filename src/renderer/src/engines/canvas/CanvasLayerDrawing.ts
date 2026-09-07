import { Container, Graphics, Text } from 'pixi.js'
import { assetUrl } from '@shared/domain/asset'
import { reportFailure } from '@/services/diagnostics'
import { familyStack } from './canvasFonts'
import { type Layer, type ShapeLayer, type TextLayer, type Transform, WHITE } from './canvasState'
import { maskKey } from './compositor'
import { paintShape } from './shapeGeometry'
import type { Size } from '../core/geometry'
import {
  BLEND_BY_MODE,
  surfaceTransform,
  alignedIn,
  shapeOf,
  drawingKey,
} from './canvasEngineSupport1'
import type { LayerSurface } from './canvasEngineSupport1'
import { CanvasSurface } from './CanvasSurface'

export abstract class CanvasLayerDrawing extends CanvasSurface {
  protected abstract buildSurface(key: string, fill?: number): LayerSurface | null

  protected abstract place(target: Container, transform: Transform, box: Size): void

  protected abstract registerFace(layer: TextLayer): Promise<void>

  protected render(): void {
    if (this.app) this.app.renderer.render(this.app.stage)
  }

  protected syncLayer(layer: Layer): void {
    // Read before the build: a picture is drawn once, when its surface comes into existence —
    // which is also the only moment the engine can know the layer at all.
    const born = !this.surfaces.has(layer.id)
    // Words and shapes are redrawn whenever they change, unlike pixels, which are what the layer
    // holds. The face counts as a change: without it, setting a caption in another font is an
    // edit the screen never shows, and a face the page was never asked for.
    const drawn = drawingKey(layer)
    const surface = this.buildSurface(layer.id, layer.kind === 'pixel' ? layer.fill : undefined)
    if (!surface) return

    this.syncDrawing(layer, surface, drawn)

    if (born) this.restorePending(layer.id, surface)

    // Never over pixels the document filled in — see `LayerSurface.fromDocument`.
    if (born && layer.kind === 'pixel' && layer.source !== undefined && !surface.fromDocument)
      void this.loadBornPixel(layer.id, layer.source)

    surface.sprite.visible = layer.visible && layer.id !== this.editing
    // `fillOpacity` is meant to fade the pixels while leaving the effects drawn around them at
    // full strength. No layer effect exists yet, so for now the two simply multiply.
    surface.sprite.alpha = layer.opacity * layer.fillOpacity
    surface.sprite.blendMode = BLEND_BY_MODE[layer.blend]
    this.place(surface.sprite, layer.transform, surface.texture)

    this.syncMask(layer)
  }

  private restorePending(layerId: string, surface: LayerSurface): void {
    this.drainPendingPicture(layerId, surface)
    this.drainPendingSnapshot(layerId, surface)
  }

  private syncDrawing(layer: Layer, surface: LayerSurface, drawn: string | null): void {
    if (drawn === null || layer.id === this.editing || this.drawings.get(layer.id) === drawn) return
    this.drawings.set(layer.id, drawn)
    if (layer.kind === 'text') this.drawText(surface, layer)
    if (layer.kind === 'shape') this.drawShape(surface, layer)
  }

  private async loadBornPixel(layerId: string, source: string): Promise<void> {
    try {
      await this.loadInto(layerId, assetUrl(source))
    } catch (error) {
      reportFailure('canvas.layer', source, error)
    }
  }

  private syncMask(layer: Layer): void {
    if (!layer.mask) return
    const bornMasked = !this.surfaces.has(maskKey(layer.id))
    // White, so a mask reveals everything until something is painted into it. Born cleared, it
    // would hide the layer whole the moment the box is ticked. The channel is Pixi's default red,
    // which is what makes the mask read like Photoshop's: paint black to hide, white to reveal.
    const mask = this.buildSurface(maskKey(layer.id), WHITE)
    if (!mask) return

    this.place(mask.sprite, surfaceTransform(layer, true), mask.texture)
    if (bornMasked) this.drainPendingMask(layer.id, mask)
    if (bornMasked) this.drainPendingSnapshot(maskKey(layer.id), mask)
  }

  /**
   * The words, rasterized into the layer's own texture. `clear: true`, so editing a caption
   * replaces it rather than laying the new one over the old.
   */
  protected drawText(surface: LayerSurface, layer: TextLayer): void {
    const renderer = this.app?.renderer
    if (!renderer) return

    const box = layer.box
    const text = new Text({
      text: layer.text,
      style: {
        fontFamily: familyStack(layer.font),
        fontSize: layer.size,
        fill: layer.color,
        align: layer.align,
        // A POINT caption never wraps: its line grows, and only a typed return breaks it.
        wordWrap: box !== null,
        wordWrapWidth: box?.width,
        lineHeight: layer.size * layer.lineHeight,
        letterSpacing: (layer.tracking / 1000) * layer.size,
      },
    })
    // Pixi aligns lines inside the text block; move the block itself within the paragraph box.
    if (box) text.x = alignedIn(layer.align, box.width, text.width)

    // A point caption's rendered block is also its interaction bounds.
    this.contents.set(layer.id, { x: text.x, y: 0, width: text.width, height: text.height })
    // A face landing re-draws the caption outside any `apply`: the memoised grips have to hear it.
    this.corners = { of: null, tool: null, box: null }
    // Preserve overflowed text so widening the box reveals it again.
    const spills = box !== null && text.height > box.height
    if (spills !== this.overflowing.has(layer.id)) this.overlay.invalidate()
    if (spills) this.overflowing.add(layer.id)
    else this.overflowing.delete(layer.id)

    const container = box ? this.boxed(text, box) : text
    renderer.render({ container, target: surface.texture, clear: true })
    if (container !== text) {
      // The words leave first, so the holder takes only its own stencil down with it.
      container.mask = null
      container.removeChild(text)
      container.destroy({ children: true })
    }
    text.destroy()
    this.render()

    // Registration redraws every caption in the family when the face becomes available.
    void this.registerFace(layer).catch(error =>
      reportFailure('font.face', layer.font.family, error),
    )
  }

  /**
   * The shape, drawn into the layer's own texture at the layer's origin. `clear: true`, so
   * recolouring one replaces it rather than laying the new paint over the old.
   */
  protected drawShape(surface: LayerSurface, layer: ShapeLayer): void {
    const renderer = this.app?.renderer
    if (!renderer) return

    const drawing = new Graphics()
    paintShape(drawing, shapeOf(layer))
    if (layer.fill !== null) drawing.fill({ color: layer.fill })
    if (layer.stroke) drawing.stroke({ color: layer.stroke.color, width: layer.stroke.width })

    renderer.render({ container: drawing, target: surface.texture, clear: true })
    drawing.destroy()
    this.render()
  }

  /**
   * A paragraph's words, cut to its box. Built and freed per pass, unlike the brush's stencil:
   * a caption is rasterized when it changes, not sixty times a second.
   */
  protected boxed(text: Text, box: Size): Container {
    const stencil = new Graphics()
    stencil.rect(0, 0, box.width, box.height)
    stencil.fill({ color: 0xffffff })

    const holder = new Container()
    holder.addChild(stencil)
    holder.addChild(text)
    holder.mask = stencil
    return holder
  }
}
