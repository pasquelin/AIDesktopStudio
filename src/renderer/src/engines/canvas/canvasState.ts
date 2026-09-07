import { NEUTRAL_ADJUSTMENTS } from '@shared/domain/adjustments'
import { DEFAULT_FONT } from '@shared/domain/font'
import type { Point, Size } from '../core/geometry'
import type {
  AdjustmentKind,
  AdjustmentLayer,
  BitDepth,
  CanvasState,
  ColorMode,
  DrawnShape,
  GroupLayer,
  Guide,
  Layer,
  LayerBase,
  LayerKind,
  LayerLocks,
  PixelLayer,
  ShapeKind,
  ShapeLayer,
  TextAlign,
  TextLayer,
  Transform,
} from './canvasLayers'

/**
 * What a document is made of: the defaults, the constructors, and the lists every panel reads.
 *
 * The shapes themselves are in `canvasLayers`, re-exported here so this stays the one address
 * callers know; the tree queries are in `canvasStateTree`, re-exported for the same reason.
 */
export * from './canvasLayers'

export const UNLOCKED: LayerLocks = { pixels: false, position: false, alpha: false }

/** The three, in the order every surface offers them — the panel's rows, and `layer.lock`. */
export const LOCK_KEYS: readonly (keyof LayerLocks)[] = ['pixels', 'position', 'alpha']

export const IDENTITY: Transform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  skewX: 0,
  skewY: 0,
  originX: 0.5,
  originY: 0.5,
}

export const ADJUSTMENT_KINDS: readonly AdjustmentKind[] = [
  'exposure',
  'contrast',
  'saturation',
  'temperature',
]

/**
 * How far each dial swings. Beside the kinds rather than in the panel that draws them: the slider
 * and the schema of `layer.setAdjustmentAmount` publish the same range, and a second copy would drift.
 */
export const DIAL_RANGE: Readonly<Record<AdjustmentKind, { min: number; max: number }>> = {
  // Stops, so ±3 is the range a photograph is recoverable within.
  exposure: { min: -3, max: 3 },
  contrast: { min: 0, max: 2 },
  saturation: { min: 0, max: 2 },
  temperature: { min: -1, max: 1 },
}

export function adjustmentLayer(
  id: string,
  name: string,
  adjustment: AdjustmentKind,
): AdjustmentLayer {
  // Copied, never the shared constant itself: one mutation of it anywhere would neutralise every
  // adjustment layer in the application at once.
  return {
    ...layerBase(id, name),
    kind: 'adjustment',
    adjustment,
    values: { ...NEUTRAL_ADJUSTMENTS },
  }
}

export const TEXT_ALIGNS: readonly TextAlign[] = ['left', 'center', 'right', 'justify']

export const DEFAULT_TEXT_SIZE = 48

export const DEFAULT_LINE_HEIGHT = 1.2

/** A frame with no surface is not a frame. */
export function sided(value: number): number {
  return Math.max(1, Math.round(value))
}

/** No document has a longer side, so past this a cell is a mistake rather than a coarse grid. */
const MAX_PIXEL_CELL = 8192

/**
 * A legal grid, or none. `sided` is not enough here: it answers `NaN` for `NaN`, which
 * `JSON.stringify` writes as `null` — a document broken for the session and clean on reopening.
 */
export function pixelCellOf(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1) return null
  return Math.min(Math.floor(raw), MAX_PIXEL_CELL)
}

/** Whether the picture is drawn on a grid at all — the question every renderer asks first. */
export function onPixelGrid(state: CanvasState | null): boolean {
  return state !== null && state.pixelCell !== null
}

/**
 * A text box as a layer stores one. The engine reads drags in floats, so one taken at 74% zoom
 * comes back as 471.5789473684211 — and the panel's fields keep every digit they are handed.
 */
export function wholeBox(box: Size): Size {
  return { width: sided(box.width), height: sided(box.height) }
}

/** `box` absent is a POINT caption, which is what a plain click opens — see `TextLayer.box`. */
export function textLayer(id: string, text: string, at: Point, box: Size | null = null): TextLayer {
  return {
    // Named after its words, and after the KIND while it has none: a nameless row in the stack
    // is a row nobody can find the caption back by.
    ...layerBase(id, text),
    kind: 'text',
    text,
    font: DEFAULT_FONT,
    size: DEFAULT_TEXT_SIZE,
    color: 0x000000,
    box: box && wholeBox(box),
    align: 'left',
    lineHeight: DEFAULT_LINE_HEIGHT,
    tracking: 0,
    transform: { ...IDENTITY, x: at.x, y: at.y },
  }
}

/** Figma's order, which is the order of the menu the user reads. */
export const SHAPE_KINDS: readonly ShapeKind[] = [
  'rectangle',
  'line',
  'arrow',
  'ellipse',
  'polygon',
  'star',
]

export const DEFAULT_SHAPE_SIDES = 5

export function shapeLayer(id: string, name: string, at: Point, drawn: DrawnShape): ShapeLayer {
  return {
    ...layerBase(id, name),
    kind: 'shape',
    ...drawn,
    transform: { ...IDENTITY, x: at.x, y: at.y },
  }
}

/** All of them: the inspector names each one from a bundle, and a nameless one shows its key. */
export const LAYER_KINDS: readonly LayerKind[] = ['pixel', 'group', 'adjustment', 'text', 'shape']

export const GUIDE_AXES: readonly Guide['axis'][] = ['x', 'y']

export const WHITE = 0xffffff

export const COLOR_MODES: readonly ColorMode[] = ['rgb', 'grayscale']
export const BIT_DEPTHS: readonly BitDepth[] = [8, 16, 32]

/**
 * Every field a layer of any kind carries, at its default. Spelled once: a caller that forgets
 * one gets a layer the compositor treats differently for no visible reason.
 */
export function layerBase(id: string, name: string): Omit<LayerBase, never> {
  return {
    id,
    name,
    visible: true,
    locked: UNLOCKED,
    opacity: 1,
    fillOpacity: 1,
    blend: 'normal',
    clipped: false,
    transform: IDENTITY,
  }
}

export function pixelLayer(id: string, name: string, fill?: number): PixelLayer {
  return { ...layerBase(id, name), kind: 'pixel', fill }
}

export function groupLayer(id: string, name: string, children: Layer[]): GroupLayer {
  return {
    ...layerBase(id, name),
    kind: 'group',
    children,
    collapsed: false,
    isolation: 'pass-through',
  }
}

/**
 * The white page a new document opens on. It is a real layer, not a background colour: it can
 * be hidden, faded or deleted like any other, and the transparency checker shows through it.
 */
const BASE_LAYER: PixelLayer = pixelLayer('layer-1', 'Background', WHITE)

/** A new document opens with one layer, already active: a canvas you cannot paint on is a bug. */
export const DEFAULT_CANVAS: CanvasState = {
  width: 1024,
  height: 1024,
  dpi: 72,
  colorMode: 'rgb',
  bitDepth: 8,
  pixelCell: null,
  layers: [BASE_LAYER],
  activeLayerId: BASE_LAYER.id,
  guides: [],
}

/**
 * Whether the layer's texture is rebuilt from its state rather than held as its pixels. A caption
 * and a shape are, so a document-wide turn cannot be left to their surfaces: the next redraw
 * would lay them out flat again, under a transform conjugated for pixels that turned.
 */
export function isRedrawn(layer: Layer): layer is TextLayer | ShapeLayer {
  return layer.kind === 'text' || layer.kind === 'shape'
}

export {
  allLayers,
  canMaskFromSelection,
  canMergeDown,
  canMoveLayer,
  canRemoveLayer,
  clampOpacity,
  isGroup,
  layerBelow,
  layerById,
  mapLayers,
  serializeCanvas,
  updateSiblings,
} from './canvasStateTree'
