import { Assets } from 'pixi.js'
import { colourOf } from '@shared/domain/color'
import { reportFailure } from '@/services/diagnostics'
import { tokenAsFont } from '../core/palette'
import { type Rect, onPixelGrid } from './canvasState'
import { selectionOutline } from './canvasSelection'
import { type Corners } from './handles'
import { box } from './shapeGeometry'
import { RULER_SIZE, type OverlayScene, type PendingShape, type ToolChrome } from './CanvasOverlay'
import { fitTo, onDevicePixels, type Viewport } from './viewport'
import type { Point } from '../core/geometry'
import { strokeWidth } from './canvasEngineSupport1'
import {
  RULER_FAMILY,
  RULER_FONT_SIZE,
  isSmartGesture,
  readColors,
  released,
} from './canvasEngineSupport2'
import { CanvasEditing } from './CanvasEditing'

export abstract class CanvasSurface extends CanvasEditing {
  protected abstract readonly onPointerDown: (event: PointerEvent) => void

  protected abstract readonly onDoubleClick: (event: MouseEvent) => void

  protected abstract readonly onPointerMove: (event: PointerEvent) => void

  protected abstract readonly onPointerLeave: () => void

  protected abstract readonly onWheel: (event: WheelEvent) => void

  protected abstract readonly onPointerUp: (event: PointerEvent) => void

  protected abstract readonly onKeyDown: (event: KeyboardEvent) => void

  protected abstract readonly onKeyUp: (event: KeyboardEvent) => void

  protected abstract readonly onBlur: () => void

  protected abstract setCropping(rect: Rect | null): void

  protected abstract dropClipping(): void

  protected abstract render(): void

  protected abstract activeCorners(): Corners | null

  protected abstract refuses(): boolean

  /**
   * The first sight of a document, and the reframing a resized frame calls for. ⌘0 does NOT come
   * through here: it is a command, and it goes through the same store path as the zoom bar.
   */
  protected frameDocument(): void {
    if (!this.state || this.hostSize.width === 0) return
    this.framed = true
    const document = { width: this.state.width, height: this.state.height }
    const inset = this.view.rulers ? RULER_SIZE : 0
    this.moveTo(fitTo(document, this.hostSize, inset, onPixelGrid(this.state)))
  }

  dispose(): void {
    this.mounting += 1
    this.removeInputListeners(this.host)
    this.stopPaletteWatch?.()
    this.stopPaletteWatch = null
    cancelAnimationFrame(this.publishFrame)
    cancelAnimationFrame(this.selectionFrame)
    this.resizer?.disconnect()
    this.resizer = null
    this.overlay.dispose()
    this.patches?.dispose()
    this.patches = null
    this.releaseLoadedPictures()
    this.disposeSurfaces()
    this.disposeCanvasState()
    this.app?.destroy({ removeView: true }, { children: true, texture: true, textureSource: true })
    this.app = null
    this.host = null
  }

  private removeInputListeners(host: HTMLElement | null): void {
    host?.removeEventListener('pointerdown', this.onPointerDown)
    host?.removeEventListener('dblclick', this.onDoubleClick)
    host?.removeEventListener('pointermove', this.onPointerMove)
    host?.removeEventListener('pointerleave', this.onPointerLeave)
    host?.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
  }

  private releaseLoadedPictures(): void {
    for (const url of this.loaded) {
      if (released(url)) void this.releasePicture(url)
    }
    this.loaded.clear()
  }

  private async releasePicture(url: string): Promise<void> {
    try {
      await Assets.unload(url)
    } catch (error) {
      reportFailure('canvas.layer', url, error)
    }
  }

  private disposeSurfaces(): void {
    this.applied = null
    for (const surface of this.surfaces.values()) surface.texture.destroy(true)
    this.surfaces.clear()
    this.forgetHeld()
    this.contents.clear()
    this.stacking = ''
    this.setCropping(null)
    for (const container of this.groups.values()) container.destroy()
    this.groups.clear()
    for (const pass of this.adjustments.values()) pass.destroy()
    this.adjustments.clear()
    for (const clip of this.clips.values()) this.destroyClip(clip)
    this.clips.clear()
  }

  private disposeCanvasState(): void {
    this.pendingMaskFills.clear()
    this.pendingSnapshots.clear()
    for (const picture of this.pendingPictures.values()) picture.destroy(true)
    this.pendingPictures.clear()
    this.drawings.clear()
    this.dropClipping()
    this.isolation?.destroy()
    this.isolation = null
    this.stamp.destroy()
    // The filter is not the stamp's to free: it is held here, and a destroyed Graphics takes
    // only what it made itself.
    this.softener.destroy()
  }

  protected readPalette(canvas: HTMLCanvasElement): void {
    this.colors = readColors(canvas)
    this.rulerFont = tokenAsFont(canvas, '--text-micro', RULER_FONT_SIZE, RULER_FAMILY)
    this.overlay.invalidate()
  }

  protected measure(): void {
    const host = this.host
    if (!host) return

    // Before anything reads the box: Pixi honours `resizeTo` through a `window.resize` listener
    // and nothing else — see `followHostSize` — so a Dockview splitter left the picture at its
    // mounted size while the overlay, which observes the host, followed. The handles then sat
    // beside the layer they belong to. Here rather than in a second observer so the order is
    // stated: the renderer takes the new box, then the overlay is measured against it.
    this.app?.resize()

    this.bounds = host.getBoundingClientRect()
    this.hostSize = { width: host.clientWidth, height: host.clientHeight }
    this.overlay.resize(this.hostSize)
    this.options.onHost(this.hostSize)
    // The document has never been framed, and now there is something to frame it in.
    if (!this.framed && this.hostSize.width > 0) this.frameDocument()
    this.render()
  }

  // Where the world is placed, and where a pointer is read: on the resolution Pixi rasterises
  // at, fixed at mount. The overlay reads the SAME viewport, or its lines drift off the blocks.
  protected shownViewport(): Viewport {
    if (!onPixelGrid(this.state)) return this.view.viewport
    return onDevicePixels(
      this.view.viewport,
      this.app?.renderer.resolution ?? window.devicePixelRatio,
    )
  }

  private toolChrome(): ToolChrome {
    const smartDrag = this.smartDrag()
    return {
      crop: this.cropping,
      handles: this.activeCorners(),
      lit: this.hover?.kind === 'handle' ? this.hover.id : null,
      pending: this.pendingShape(),
      smartBox: smartDrag ? box(smartDrag.from, smartDrag.to, false) : null,
      textBox: this.textBox,
      overflowing: this.overflowing.has(this.state?.activeLayerId ?? ''),
      selection: this.selection,
      brushMark:
        this.pointer && this.ringed() && !this.refuses() ? this.brushMark(this.pointer) : null,
      commentDraft: this.gesture.kind === 'comment' ? this.gesture.points : null,
    }
  }

  protected scene(): OverlayScene | null {
    if (!this.state) return null

    return {
      viewport: this.shownViewport(),
      host: this.hostSize,
      document: { width: this.state.width, height: this.state.height },
      showRulers: this.view.rulers,
      showGuides: this.view.guides,
      showGrid: this.view.grid,
      pixelCell: this.state.pixelCell,
      resolution: this.app?.renderer.resolution ?? window.devicePixelRatio,
      guides: this.state.guides,
      activeGuideId: this.gesture.kind === 'guide' ? this.gesture.id : null,
      pointer: this.pointer,
      colors: this.colors,
      rulerFont: this.rulerFont,
      language: this.language,
      marching: this.marching(),
      // Handed over whole rather than gated here: every painter already returns on nothing to
      // draw, and a gate repeating those guards is one a new decoration gets forgotten from —
      // silently, since nothing would fail, it would simply never appear.
      tools: this.toolChrome(),
    }
  }

  /**
   * Whether anything on screen is dashed, which is what keeps the overlay's frame loop alive.
   * Kept beside what draws the ants: a fourth dashed surface that forgot to say so would simply
   * stand still.
   */
  protected marching(): boolean {
    return (
      selectionOutline(this.selection).length > 0 ||
      this.cropping !== null ||
      this.textBox !== null ||
      isSmartGesture(this.gesture)
    )
  }

  /** The two corners a promptable drag stands between, for either tool. */
  private smartDrag(): { from: Point; to: Point } | null {
    if (!isSmartGesture(this.gesture)) return null
    return this.gridBox(this.gesture.from, this.gesture.to)
  }

  /**
   * The shape under the hand, dressed in the paint it will be committed with — the overlay draws
   * what will land, not a marquee around where it will.
   *
   * Stroked rather than filled for the two that have no inside; the brush size is the width,
   * which is the one control the bar already offers.
   */
  protected pendingShape(): PendingShape | null {
    const shape = this.pending
    if (!shape) return null

    const color = colourOf(this.brush.color)
    return shape.kind === 'line' || shape.kind === 'arrow'
      ? { shape, fill: null, stroke: { color, width: strokeWidth(this.brush.size) } }
      : { shape, fill: color, stroke: null }
  }
}
