import { type Container } from 'pixi.js'
import { newId } from '@/helpers/ids'
import { type Layer, type Rect } from './canvasState'
import { layerMatrix, type Affine } from './layerSpace'
import { guideNear, GUIDE_GRAB, type Axis } from './guides'
import type { Point } from '../core/geometry'
import { surfaceTransform } from './canvasEngineSupport1'
import type { LayerSurface, BrushTarget } from './canvasEngineSupport1'
import { CanvasInteraction } from './CanvasInteraction'

export abstract class CanvasPainting extends CanvasInteraction {
  /**
   * Where a surface's pixels land in the document, as `syncLayer` places them — the layer's own
   * transform, or the identity for a mask that was unlinked from it, and always against the box
   * `place` was given, which is the texture rather than the document.
   */
  protected surfaceMatrix(layer: Layer, mask: boolean, surface: LayerSurface): Affine {
    return layerMatrix(surfaceTransform(layer, mask), surface.texture)
  }

  /**
   * Wraps document-space artwork so it lands on the surface's own pixels. One container, reused:
   * a dab runs per `pointermove`, and a fresh node per dab is an allocation per frame of a drag.
   */
  protected inSurfaceSpace(toSurface: Affine, content: Container): Container {
    this.paintSpace.removeChildren()
    this.paintSpace.addChild(content)
    this.paintMatrix.set(
      toSurface.a,
      toSurface.b,
      toSurface.c,
      toSurface.d,
      toSurface.tx,
      toSurface.ty,
    )
    this.paintSpace.setFromMatrix(this.paintMatrix)
    return this.paintSpace
  }

  protected documentRect(): Rect | null {
    const state = this.state
    return state ? { x: 0, y: 0, width: state.width, height: state.height } : null
  }

  /**
   * Opens a recording and hands back the surface's own rectangle, which the bucket then dirties
   * whole. Counted against the texture rather than the document: tiles index the surface being
   * written to, and the two only happen to share a size.
   */
  protected beginPixels(target: BrushTarget): Rect {
    const { width, height } = target.surface.texture
    this.patches?.begin(newId(), target.key, target.surface.texture, { width, height })
    return { x: 0, y: 0, width, height }
  }

  protected endPixels(): void {
    const patchId = this.patches?.end() ?? null
    if (patchId) this.options.onPixels(patchId)
  }

  /** The guide under the pointer, tested in screen pixels so it stays grabbable at any zoom. */
  protected grabGuide(point: Point): { id: string; axis: Axis } | null {
    if (!this.state || !this.view.guides) return null

    const tolerance = GUIDE_GRAB / this.view.viewport.scale
    const vertical = guideNear(this.state.guides, 'x', point.x, tolerance)
    if (vertical) return { id: vertical.id, axis: 'x' }

    const horizontal = guideNear(this.state.guides, 'y', point.y, tolerance)
    return horizontal ? { id: horizontal.id, axis: 'y' } : null
  }
}
