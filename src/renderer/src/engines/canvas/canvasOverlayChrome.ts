import { selectionOutline } from './canvasSelection'
import { cornersOfRect, gripRects, HANDLE_IDS } from './handles'
import { rulerStep, tickLabel, ticks } from './rulers'
import { shapeOutline } from './shapeGeometry'
import { crisp, toScreen, visibleRect } from './viewport'
import {
  ants,
  line,
  RULER_SIZE,
  twoTone,
  type OverlayContext,
  type OverlayScene,
} from './canvasOverlayPrimitives'

function tracePoints(
  context: OverlayContext,
  scene: OverlayScene,
  points: readonly { x: number; y: number }[],
  close: boolean,
  snap = true,
): void {
  const [firstPoint, ...remaining] = points
  if (!firstPoint) return
  context.beginPath()
  const first = toScreen(scene.viewport, firstPoint)
  context.moveTo(snap ? crisp(first.x) : first.x, snap ? crisp(first.y) : first.y)
  for (const point of remaining) {
    const screen = toScreen(scene.viewport, point)
    context.lineTo(snap ? crisp(screen.x) : screen.x, snap ? crisp(screen.y) : screen.y)
  }
  if (close) context.lineTo(snap ? crisp(first.x) : first.x, snap ? crisp(first.y) : first.y)
}

function drawSelection(context: OverlayContext, scene: OverlayScene, phase: number): void {
  const points = selectionOutline(scene.tools.selection)
  if (points.length === 0) return
  ants(context, () => tracePoints(context, scene, points, true), phase, scene.colors)
}

function drawCommentDraft(context: OverlayContext, scene: OverlayScene): void {
  const points = scene.tools.commentDraft
  if (!points || points.length < 2) return
  context.strokeStyle = scene.colors.accent
  tracePoints(context, scene, points, false, false)
  context.stroke()
}

function drawPending(context: OverlayContext, scene: OverlayScene): void {
  const pending = scene.tools.pending
  if (!pending) return
  const points = shapeOutline(pending.shape)
  if (points.length === 0) return
  const open = pending.shape.kind === 'line' || pending.shape.kind === 'arrow'
  tracePoints(context, scene, points, !open, false)
  if (pending.fill) {
    context.fillStyle = pending.fill
    context.fill()
  }
  if (pending.stroke) {
    context.strokeStyle = pending.stroke.color
    context.lineWidth = pending.stroke.width * scene.viewport.scale
    context.stroke()
    context.lineWidth = 1
  }
}

function drawOutline(
  context: OverlayContext,
  scene: OverlayScene,
  corners: Parameters<typeof gripRects>[0],
  phase: number,
): void {
  ants(
    context,
    () => tracePoints(context, scene, [corners.nw, corners.ne, corners.se, corners.sw], true),
    phase,
    scene.colors,
  )
}

function drawGrips(
  context: OverlayContext,
  scene: OverlayScene,
  corners: Parameters<typeof gripRects>[0],
): void {
  const rects = gripRects(corners, scene.viewport)
  context.fillStyle = scene.colors.accent
  for (const id of HANDLE_IDS) {
    const rect = rects[id]
    const grow = id === scene.tools.lit ? 1 : 0
    context.fillRect(rect.x - grow, rect.y - grow, rect.width + grow * 2, rect.height + grow * 2)
  }
}

function drawCrop(context: OverlayContext, scene: OverlayScene, phase: number): void {
  const crop = scene.tools.crop
  if (!crop) return
  const origin = toScreen(scene.viewport, { x: 0, y: 0 })
  const end = toScreen(scene.viewport, { x: scene.document.width, y: scene.document.height })
  const topLeft = toScreen(scene.viewport, crop)
  const bottomRight = toScreen(scene.viewport, { x: crop.x + crop.width, y: crop.y + crop.height })
  context.fillStyle = scene.colors.scrim
  context.fillRect(origin.x, origin.y, end.x - origin.x, topLeft.y - origin.y)
  context.fillRect(origin.x, bottomRight.y, end.x - origin.x, end.y - bottomRight.y)
  context.fillRect(origin.x, topLeft.y, topLeft.x - origin.x, bottomRight.y - topLeft.y)
  context.fillRect(bottomRight.x, topLeft.y, end.x - bottomRight.x, bottomRight.y - topLeft.y)
  const corners = cornersOfRect(crop)
  drawOutline(context, scene, corners, phase)
  drawGrips(context, scene, corners)
}

/** The box a caption is being sized into: a frame, drawn in the same ants a marquee is. */
function drawTextBox(context: OverlayContext, scene: OverlayScene, phase: number): void {
  const rect = scene.tools.textBox
  if (!rect) return
  drawOutline(context, scene, cornersOfRect(rect), phase)
}

function drawSmartBox(context: OverlayContext, scene: OverlayScene, phase: number): void {
  const box = scene.tools.smartBox
  if (!box) return
  drawOutline(context, scene, cornersOfRect(box), phase)
}

function drawTextOverflow(context: OverlayContext, scene: OverlayScene): void {
  if (!scene.tools.handles || !scene.tools.overflowing) return
  const corner = toScreen(scene.viewport, scene.tools.handles.se)
  context.strokeStyle = scene.colors.accent
  line(context, corner.x - 4, corner.y - 4, corner.x + 4, corner.y + 4)
  line(context, corner.x + 4, corner.y - 4, corner.x - 4, corner.y + 4)
}

function drawBrush(context: OverlayContext, scene: OverlayScene): void {
  if (!scene.pointer || !scene.tools.brushMark) return
  const mark = scene.tools.brushMark
  if ('stamp' in mark) {
    const corners = cornersOfRect(mark.stamp)
    twoTone(
      context,
      () => tracePoints(context, scene, [corners.nw, corners.ne, corners.se, corners.sw], true),
      scene.colors,
    )
    return
  }
  const trace = (): void => {
    context.beginPath()
    context.arc(
      scene.pointer?.x ?? 0,
      scene.pointer?.y ?? 0,
      mark.radius * scene.viewport.scale,
      0,
      Math.PI * 2,
    )
  }
  twoTone(context, trace, scene.colors)
}

export function drawTools(context: OverlayContext, scene: OverlayScene, phase: number): void {
  drawSelection(context, scene, phase)
  drawCommentDraft(context, scene)
  drawPending(context, scene)
  drawTextBox(context, scene, phase)
  drawSmartBox(context, scene, phase)
  drawCrop(context, scene, phase)
  if (scene.tools.handles) {
    drawOutline(context, scene, scene.tools.handles, phase)
    drawGrips(context, scene, scene.tools.handles)
  }
  drawTextOverflow(context, scene)
  drawBrush(context, scene)
}

function drawAxisRuler(context: OverlayContext, scene: OverlayScene, horizontal: boolean): void {
  const visible = visibleRect(scene.viewport, scene.host)
  const range: [number, number] = horizontal
    ? [visible.x, visible.x + visible.width]
    : [visible.y, visible.y + visible.height]
  const step = rulerStep(scene.viewport.scale)
  for (const value of ticks(range[0], range[1], step.minor)) {
    const screen = horizontal
      ? toScreen(scene.viewport, { x: value, y: 0 }).x
      : toScreen(scene.viewport, { x: 0, y: value }).y
    const major = Math.abs(value / step.major - Math.round(value / step.major)) < 1e-8
    if (horizontal) line(context, crisp(screen), RULER_SIZE, crisp(screen), major ? 10 : 16)
    else line(context, RULER_SIZE, crisp(screen), major ? 10 : 16, crisp(screen))
    if (!major || screen < RULER_SIZE) continue
    const label = tickLabel(value, step.major, scene.language)
    context.fillText(label, horizontal ? screen + 2 : 2, horizontal ? 2 : screen + 2)
  }
}

export function drawRulers(context: OverlayContext, scene: OverlayScene): void {
  context.fillStyle = scene.colors.rulerBackground
  context.fillRect(0, 0, scene.host.width, RULER_SIZE)
  context.fillRect(0, 0, RULER_SIZE, scene.host.height)
  context.strokeStyle = scene.colors.rulerTick
  context.fillStyle = scene.colors.rulerText
  context.font = scene.rulerFont
  context.textAlign = 'left'
  context.textBaseline = 'top'
  drawAxisRuler(context, scene, true)
  drawAxisRuler(context, scene, false)
  if (scene.pointer) {
    line(context, crisp(scene.pointer.x), 0, crisp(scene.pointer.x), RULER_SIZE)
    line(context, 0, crisp(scene.pointer.y), RULER_SIZE, crisp(scene.pointer.y))
  }
  context.fillStyle = scene.colors.rulerBackground
  context.fillRect(0, 0, RULER_SIZE, RULER_SIZE)
}
