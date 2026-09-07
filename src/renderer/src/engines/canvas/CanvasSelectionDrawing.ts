import { Container, type Graphics } from 'pixi.js'
import { type Rect } from './canvasState'
import { selectionStencil } from './selectionStencil'
import { mapRect } from './layerSpace'
import type { Point } from '../core/geometry'
import { brushRect, grownBy } from './tiles'
import { cellAt, cellRuns, cellsOfLine } from './pixelGrid'
import type { BrushTarget } from './canvasEngineSupport1'
import { CanvasInput } from './CanvasInput'

export abstract class CanvasSelectionDrawing extends CanvasInput {
  /**
   * A fast drag delivers a handful of `pointermove` for a long distance; drawing only at those
   * points leaves a dotted line. One dab every quarter-radius closes it.
   */
  protected stroke(target: BrushTarget, from: Point, to: Point): void {
    const cell = this.pixelCell()
    if (cell !== null) {
      // Bresenham, the first cell left out: `from` was stamped by the move before this one, and
      // a second pass over it would compose a half-opaque stroke onto itself. A segment the line
      // refuses still stamps where the hand IS, or the next one's first cell is a hole.
      const cells = cellsOfLine(cellAt(from, cell), cellAt(to, cell))
      this.stampCells(target, cells.length === 0 ? [cellAt(to, cell)] : cells.slice(1))
      return
    }

    const distance = Math.hypot(to.x - from.x, to.y - from.y)
    const step = Math.max(1, this.brush.size / 4)
    const count = Math.ceil(distance / step)

    const points: Point[] = []
    for (let index = 1; index <= count; index += 1) {
      const ratio = index / count
      points.push({
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
      })
    }
    this.dab(target, points)
  }

  /**
   * Every point of the segment in ONE render pass. A pass per point meant a framebuffer bind and
   * a draw call per interpolated dab — up to several hundred inside a single `pointermove`.
   *
   * It is also the only way the opacity comes out right: separate passes composite the dabs onto
   * each other, so a half-opaque stroke darkened at every joint.
   */
  protected dab(target: BrushTarget, points: readonly Point[]): void {
    if (points.length === 0) return
    const cell = this.pixelCell()
    if (cell !== null) {
      return this.stampCells(
        target,
        points.map(point => cellAt(point, cell)),
      )
    }

    const radius = this.brush.size / 2
    this.paint(target, [brushRect(points, radius)], () => {
      for (const point of points) this.stamp.circle(point.x, point.y, radius)
    })
  }

  /** The cells of ONE line, as one rectangle per row — see `cellRuns`. */
  protected stampCells(target: BrushTarget, cells: readonly Point[]): void {
    const cell = this.pixelCell()
    if (cell === null || cells.length === 0) return

    const runs = cellRuns(cells, cell, this.brush.size)
    // One pixel of slack, as `brushRect` keeps: a layer placed on a fraction maps a run's edge
    // onto a fragment the antialiasing paints, in a tile an undo would otherwise leave behind.
    this.paint(
      target,
      runs.map(run => grownBy(run, 1)),
      () => {
        for (const run of runs) this.stamp.rect(run.x, run.y, run.width, run.height)
      },
    )
  }

  /** What a disc and a run share: the tiles they cost, the one pass, the blend. */
  protected paint(target: BrushTarget, covered: readonly Rect[], trace: () => void): void {
    this.stamp.clear()
    trace()
    this.ink(this.stamp, this.tool === 'eraser' ? null : this.brush.color, this.brush.opacity)
    // The fringe is added AFTER the mapping, and it has to be: a filter is applied once the
    // container's transform has run, so its padding counts SURFACE pixels while the brush's
    // radius counts document ones. Added before, a layer scaled 2× recorded half its stroke.
    this.commit(
      target,
      covered.map(box => grownBy(mapRect(target.toSurface, box), this.fringe())),
      this.stamp,
    )
  }

  /** The colour a sheet lays down, and `null` for the pass that takes colour away. */
  protected ink(sheet: Graphics, color: number | null, alpha: number): void {
    sheet.fill({ color: color ?? 0xffffff, alpha })
    // Erasing is the same pass in `erase` blend: on a transparent layer, painting white would
    // just paint white.
    sheet.blendMode = color === null ? 'erase' : 'normal'
  }

  /**
   * The tiles an undo will put back, then ONE pass onto the surface. `covered` is already in
   * SURFACE space, which is where a filter's padding is counted and where antialiasing spills.
   */
  protected commit(target: BrushTarget, covered: readonly Rect[], sheet: Graphics): void {
    const renderer = this.app?.renderer
    if (!renderer) return

    // Before a single pixel is written: what the tiles hold now is what an undo will put back.
    // Mapped onto the surface by the caller — tiles index the texture, and a stroke on a turned
    // layer covers a different set of them than its document-space box suggests.
    for (const box of covered) this.patches?.touch(box)

    // `clear: false`, or every dab would wipe the stroke that came before it. And `target`,
    // not the `renderTexture` option, which v8 deprecated.
    renderer.render({
      container: this.inSurfaceSpace(target.toSurface, this.clipped(sheet)),
      target: target.surface.texture,
      clear: false,
    })
    this.render()
  }

  /**
   * What to render so a stroke stops at the selection's edge. Cut on the GPU rather than tested
   * per dab: the shape is a stencil, and the same one serves the brush, the eraser and the
   * bucket. Handed back unchanged when nothing is selected, which is the common case.
   */
  protected clipped(container: Container): Container {
    if (!this.selection) {
      this.dropClipping()
      return container
    }

    // Kept while the selection is the same OBJECT, and it is replaced wholesale by
    // `setSelection` — so this cache cannot drift. Rebuilt per dab it re-ran the trigonometry of
    // an ellipse and re-tessellated a thousand-point lasso on every frame of a stroke, which is
    // the hottest gesture there is.
    const held = this.clipping
    if (held?.of === this.selection) {
      // Only the stencil stays between passes — index 0, put there first below. What follows it
      // is whatever the LAST pass was drawing, and it belongs to its owner, not to this holder.
      held.holder.removeChildren(1)
      held.holder.addChild(container)
      return held.holder
    }

    const stencil = selectionStencil(this.selection)
    if (!stencil) {
      this.dropClipping()
      return container
    }

    const holder = new Container()
    holder.addChild(stencil)
    holder.addChild(container)
    holder.mask = stencil
    this.dropClipping()
    this.clipping = { of: this.selection, holder, stencil }
    return holder
  }

  /**
   * Frees the pass, and only the pass. Its borrowed children leave first: a holder freed with
   * its subtree took the brush's stamp with it, and the stamp is built once with the engine —
   * so the first stroke after a marquee was dropped killed the brush for the whole session.
   */
  protected dropClipping(): void {
    const clipping = this.clipping
    this.clipping = null
    if (!clipping) return

    clipping.holder.removeChildren()
    clipping.stencil.destroy()
    clipping.holder.destroy()
  }

  /**
   * The one place the frame changes, so that nothing can move it without the bar hearing.
   *
   * Reported only when there is or is not one, never on the frame itself: this runs on every
   * pointer move of a crop drag, and the bar has the same answer for all of them.
   */
  protected setCropping(rect: Rect | null): void {
    const framed = this.cropping !== null
    this.cropping = rect
    if (framed !== (rect !== null)) this.options.onCropFrame(rect !== null)
  }
}
