import { clamp } from '@shared/numeric'
import type { Size } from '../core/geometry'
import { ticks } from './rulers'
import { gridIsLegible } from './pixelGrid'
import { crisp, crispOn, toScreen, visibleRect } from './viewport'
import { drawRulers, drawTools } from './canvasOverlayChrome'

/**
 * The 2D overlay drawn above the Pixi canvas. It holds no pixel of the document: everything here
 * is chrome — the frame, the rulers, the guides, the selection — and none of it reaches the
 * export, which renders the Pixi side alone.
 *
 * It draws in SCREEN coordinates, never in document ones. That is what keeps a hairline one real
 * pixel wide at 1600% as well as at 5%.
 */

export {
  ants,
  antPhase,
  line,
  RULER_SIZE,
  twoTone,
  type BrushMark,
  type OverlayContext,
  type OverlayColors,
  type OverlayScene,
  type PendingShape,
  type ToolChrome,
} from './canvasOverlayPrimitives'
import { antPhase, line, type OverlayContext, type OverlayScene } from './canvasOverlayPrimitives'
/**
 * One frame of the overlay. Pure in everything but the context: the scene decides, this only
 * puts it on screen — which is what lets it be tested without a GPU.
 */
export function drawOverlay(context: OverlayContext, scene: OverlayScene, phase = 0): void {
  context.clearRect(0, 0, scene.host.width, scene.host.height)
  context.save()
  // Every stroke here is chrome, so nothing scales with the zoom.
  context.lineWidth = 1
  context.setLineDash([])

  drawFrame(context, scene)
  // Right after the frame: the grid is the finest and the most numerous chrome there is, and
  // everything else has to read over it.
  if (scene.showGrid) drawPixelGrid(context, scene)
  if (scene.showGuides) drawGuides(context, scene)
  drawTools(context, scene, phase)
  if (scene.showRulers) drawRulers(context, scene)

  context.restore()
}

/** The document's own edge — without it a white layer on a dark panel has no boundary. */
function drawFrame(context: OverlayContext, scene: OverlayScene): void {
  const origin = toScreen(scene.viewport, { x: 0, y: 0 })
  const corner = toScreen(scene.viewport, { x: scene.document.width, y: scene.document.height })

  context.strokeStyle = scene.colors.frame
  context.strokeRect(
    crisp(origin.x),
    crisp(origin.y),
    Math.round(corner.x - origin.x),
    Math.round(corner.y - origin.y),
  )
}

/** The artwork's own grid: the cell, and the document pixel under it where a cell holds more. */
function drawPixelGrid(context: OverlayContext, scene: OverlayScene): void {
  const cell = scene.pixelCell
  if (cell === null) return

  // The finer one first, so the cell's lines are drawn over it where the two land together.
  if (cell > 1) rulePixelGrid(context, scene, 1, scene.colors.gridPixel)
  rulePixelGrid(context, scene, cell, scene.colors.gridCell)
}

/**
 * One step of it, in hairlines a device pixel wide — the ants' two passes would be three hundred
 * lines stroked twice per frame, redrawn on every pixel of a pan.
 */
function rulePixelGrid(
  context: OverlayContext,
  scene: OverlayScene,
  step: number,
  color: string,
): void {
  const { viewport, document: size, host, resolution } = scene
  if (!gridIsLegible(step, viewport.scale)) return

  const visible = visibleRect(viewport, host)
  // Bounded to the document, or the lines bleed over the checkerboard around it; and to the host,
  // or every line of a 4096 document is emitted thirty times longer than the part on screen.
  const left = clamp(visible.x, 0, size.width)
  const right = clamp(visible.x + visible.width, 0, size.width)
  const top = clamp(visible.y, 0, size.height)
  const bottom = clamp(visible.y + visible.height, 0, size.height)
  const fromY = Math.max(top * viewport.scale + viewport.y, 0)
  const toY = Math.min(bottom * viewport.scale + viewport.y, host.height)
  const fromX = Math.max(left * viewport.scale + viewport.x, 0)
  const toX = Math.min(right * viewport.scale + viewport.x, host.width)

  context.strokeStyle = color
  context.lineWidth = 1 / resolution
  context.beginPath()
  for (const value of ticks(left, right, step)) {
    const x = crispOn(value * viewport.scale + viewport.x, resolution)
    context.moveTo(x, fromY)
    context.lineTo(x, toY)
  }
  for (const value of ticks(top, bottom, step)) {
    const y = crispOn(value * viewport.scale + viewport.y, resolution)
    context.moveTo(fromX, y)
    context.lineTo(toX, y)
  }
  context.stroke()
  context.lineWidth = 1
}

function drawGuides(context: OverlayContext, scene: OverlayScene): void {
  for (const guide of scene.guides) {
    context.strokeStyle =
      guide.id === scene.activeGuideId ? scene.colors.accent : scene.colors.guide

    if (guide.axis === 'x') {
      const x = crisp(toScreen(scene.viewport, { x: guide.position, y: 0 }).x)
      line(context, x, 0, x, scene.host.height)
    } else {
      const y = crisp(toScreen(scene.viewport, { x: 0, y: guide.position }).y)
      line(context, 0, y, scene.host.width, y)
    }
  }
}

export class CanvasOverlay {
  private readonly canvas = document.createElement('canvas')
  private readonly context: CanvasRenderingContext2D | null
  private frame = 0

  constructor(private readonly scene: () => OverlayScene | null) {
    this.canvas.style.position = 'absolute'
    this.canvas.style.inset = '0'
    this.canvas.style.pointerEvents = 'none'
    this.context = this.canvas.getContext('2d')
  }

  mount(host: HTMLElement): void {
    host.appendChild(this.canvas)
    this.invalidate()
  }

  invalidate(): void {
    if (this.frame === 0) this.frame = requestAnimationFrame(this.draw)
  }

  resize(size: Size): void {
    const ratio = window.devicePixelRatio || 1
    const width = Math.max(1, Math.round(size.width * ratio))
    const height = Math.max(1, Math.round(size.height * ratio))
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
      this.canvas.style.width = `${size.width}px`
      this.canvas.style.height = `${size.height}px`
    }
    this.context?.setTransform(ratio, 0, 0, ratio, 0, 0)
    this.invalidate()
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.canvas.remove()
  }

  private readonly draw = (time: number): void => {
    this.frame = 0
    const scene = this.scene()
    if (!scene) return
    if (this.context) drawOverlay(this.context, scene, antPhase(time))
    if (scene.marching) this.invalidate()
  }
}
