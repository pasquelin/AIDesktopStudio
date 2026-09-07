import type { CanvasSelection } from './canvasSelection'
import type { Guide, Rect } from './canvasState'
import type { Corners, HandleId } from './handles'
import type { ShapeGeometry } from './shapeGeometry'
import type { Point, Size } from '../core/geometry'
import type { Viewport } from './viewport'

export const RULER_SIZE = 20

export type OverlayContext = Pick<
  CanvasRenderingContext2D,
  | 'arc'
  | 'beginPath'
  | 'clearRect'
  | 'fill'
  | 'fillRect'
  | 'fillText'
  | 'font'
  | 'lineDashOffset'
  | 'lineTo'
  | 'lineWidth'
  | 'moveTo'
  | 'restore'
  | 'save'
  | 'setLineDash'
  | 'setTransform'
  | 'stroke'
  | 'strokeRect'
  | 'strokeStyle'
  | 'fillStyle'
  | 'textAlign'
  | 'textBaseline'
>

export type OverlayColors = {
  frame: string
  guide: string
  rulerBackground: string
  rulerText: string
  rulerTick: string
  accent: string
  marqueeLight: string
  marqueeDark: string
  gridCell: string
  gridPixel: string
  scrim: string
}

export type BrushMark = { radius: number } | { stamp: Rect }
export type PendingShape = {
  shape: ShapeGeometry
  fill: string | null
  stroke: { color: string; width: number } | null
}
export type ToolChrome = {
  crop: Rect | null
  textBox: Rect | null
  smartBox: Rect | null
  overflowing: boolean
  handles: Corners | null
  lit: HandleId | null
  pending: PendingShape | null
  selection: CanvasSelection
  brushMark: BrushMark | null
  commentDraft: readonly Point[] | null
}
export type OverlayScene = {
  viewport: Viewport
  host: Size
  document: Size
  showRulers: boolean
  showGuides: boolean
  showGrid: boolean
  pixelCell: number | null
  resolution: number
  guides: readonly Guide[]
  activeGuideId: string | null
  pointer: Point | null
  colors: OverlayColors
  rulerFont: string
  language: string | undefined
  marching: boolean
  tools: ToolChrome
}

export function line(
  context: OverlayContext,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  context.beginPath()
  context.moveTo(x1, y1)
  context.lineTo(x2, y2)
  context.stroke()
}

export function twoTone(context: OverlayContext, trace: () => void, colors: OverlayColors): void {
  context.strokeStyle = colors.marqueeLight
  trace()
  context.stroke()
  context.strokeStyle = colors.marqueeDark
  trace()
  context.stroke()
}

export function ants(
  context: OverlayContext,
  trace: () => void,
  phase: number,
  colors: OverlayColors,
): void {
  context.setLineDash([])
  context.strokeStyle = colors.marqueeLight
  trace()
  context.stroke()
  context.setLineDash([5, 4])
  context.lineDashOffset = -phase
  context.strokeStyle = colors.marqueeDark
  trace()
  context.stroke()
  context.setLineDash([])
  context.lineDashOffset = 0
}

export function antPhase(time: number): number {
  return ((time % 500) / 500) * 9
}
