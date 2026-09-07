import type { AdjustmentStack } from '@shared/domain/adjustments'
import type { BlendMode } from '@shared/domain/canvasBlend'
import type { FontRef } from '@shared/domain/font'
import type { Point, Size } from '../core/geometry'

/**
 * An image document, as plain data. It holds no Pixi object on purpose: an engine is rebuilt
 * from its serialized state, never from its DOM, and jsdom has no WebGL context to test against.
 *
 * Pixels are NOT here — they live in a GPU texture per layer, owned by `CanvasEngine` and keyed
 * by layer id. This is what a layer *is*, not what it shows.
 *
 * Apart from the constants and constructors that build it, in `canvasState`: the tree queries of
 * `canvasStateTree` read these same shapes, and a type each half re-imported from the other is
 * the cycle `import-cycles.test.ts` catches.
 */

/**
 * What each padlock holds. Three of them rather than one boolean: locking a layer's position
 * while still painting on it is the ordinary case, not an advanced one.
 */
export type LayerLocks = {
  pixels: boolean
  position: boolean
  alpha: boolean
}

export type Rect = { x: number; y: number; width: number; height: number }

/** Origin is a fraction of the bounding box, so a resize does not move the pivot. */
export type Transform = {
  x: number
  y: number
  scaleX: number
  scaleY: number
  /** Radians. */
  rotation: number
  skewX: number
  skewY: number
  originX: number
  originY: number
}

export type LayerBase = {
  id: string
  name: string
  visible: boolean
  locked: LayerLocks
  /** 0 to 1. */
  opacity: number
  /** Affects the pixels, not the effects drawn around them. 0 to 1. */
  fillOpacity: number
  blend: BlendMode
  /**
   * A blend mask: 8-bit, independent of the pixels, and owned by the engine like them. `linked`
   * is whether moving the layer moves the mask with it.
   */
  mask?: { enabled: boolean; linked: boolean }
  /** This layer is cut out by the one below it. */
  clipped: boolean
  transform: Transform
}

export type PixelLayer = LayerBase & {
  kind: 'pixel'
  /**
   * Packed RGB painted edge to edge when the layer is born, and never again — this is what
   * gives a new document its white page. Absent leaves the layer transparent.
   */
  fill?: number
  /**
   * The asset whose picture the layer was born holding, drawn into its texture as soon as the
   * surface exists. In the state rather than pushed at the engine: pixels do not survive a
   * closed tab, an undo or a detached panel, and this is what brings them back.
   */
  source?: string
}

/** `pass-through` lets an adjustment inside the group reach what is under the group. */
export type GroupIsolation = 'pass-through' | 'isolate'

export type GroupLayer = LayerBase & {
  kind: 'group'
  children: Layer[]
  collapsed: boolean
  isolation: GroupIsolation
}

/**
 * Which dial an adjustment layer exposes. Four, and only four, because these are the ones the
 * grading pass actually applies — a `curves` or a `LUT` entry would be a row in the panel that
 * changes nothing on screen, which is the one thing a layer must never be.
 */
export type AdjustmentKind = 'exposure' | 'contrast' | 'saturation' | 'temperature'

export type AdjustmentLayer = LayerBase & {
  kind: 'adjustment'
  adjustment: AdjustmentKind
  /**
   * The whole stack, not just the dial this layer names: the pass is one shader, and carrying
   * the others at their neutral costs nothing while keeping two layers from needing two passes.
   */
  values: AdjustmentStack
}

/**
 * Words rather than pixels. Kept as text so it stays editable and stays sharp at any zoom — a
 * caption rasterized at the moment it was typed is a caption nobody can fix a typo in.
 */
export type TextAlign = 'left' | 'center' | 'right' | 'justify'

export type TextLayer = LayerBase & {
  kind: 'text'
  text: string
  /**
   * What it is set in. The same reference a 3D text stores, from the same list — see
   * `domain/font`: a studio where the two workspaces name their typefaces differently is a
   * studio where the same caption cannot be moved from one to the other.
   */
  font: FontRef
  /** Points at 1:1, before the layer's own scale. */
  size: number
  /** Packed RGB, the form Pixi takes. */
  color: number
  /**
   * What the words wrap inside, in document units — a PARAGRAPH caption. What outgrows it in
   * height is hidden rather than spilled, and the box says so; nothing is lost, and widening it
   * brings the rest back.
   *
   * `null` is the other kind, which a plain click opens: a POINT caption has no box at all. Its
   * line simply grows, only a typed return breaks it, and there is nothing for it to outgrow.
   */
  box: Size | null
  align: TextAlign
  /** A multiple of the size, so a caption keeps its leading when it is set bigger. */
  lineHeight: number
  /** Thousandths of an em, the unit a type panel shows — Photoshop's own. */
  tracking: number
}

/**
 * Which shape a shape layer holds. Declared here rather than beside the arithmetic that derives
 * it: `shapeGeometry` reads this file, and a stored layer must not depend on a Pixi-facing module.
 */
export type ShapeKind = 'rectangle' | 'line' | 'arrow' | 'ellipse' | 'polygon' | 'star'

export type ShapeStroke = { color: number; width: number }

/**
 * A shape kept as its two points rather than as pixels, so it stays editable: changing the fill
 * of a rectangle drawn an hour ago redraws it, where a rasterized one would have to be undone.
 */
export type ShapeLayer = LayerBase & {
  kind: 'shape'
  shape: ShapeKind
  /** The drag's two points, in the layer's own space — its origin is its box's top-left corner. */
  from: Point
  to: Point
  /** Vertex count for the polygon and point count for the star; the four others ignore it. */
  sides: number
  /** `null` leaves the inside empty, which is what an outlined rectangle is. */
  fill: number | null
  stroke: ShapeStroke | null
}

/** A shape without the layer around it: what the hand drew, before the stack names and places it. */
export type DrawnShape = Pick<ShapeLayer, 'shape' | 'from' | 'to' | 'sides' | 'fill' | 'stroke'>

export type Layer = PixelLayer | GroupLayer | AdjustmentLayer | TextLayer | ShapeLayer

export type LayerKind = Layer['kind']

export type Guide = {
  id: string
  axis: 'x' | 'y'
  /** Document coordinates, so a guide keeps its place through zoom and pan. */
  position: number
}

export type ColorMode = 'rgb' | 'grayscale'

export type BitDepth = 8 | 16 | 32

export type CanvasState = {
  width: number
  height: number
  /** 72 for the screen, 300 for print. Carried for export, never used to lay anything out. */
  dpi: number
  colorMode: ColorMode
  bitDepth: BitDepth
  /** How many document pixels wide one square of the artwork is. `null` for no grid at all. */
  pixelCell: number | null
  /** Bottom first, so the last one is what the eye sees on top. */
  layers: Layer[]
  activeLayerId: string | null
  guides: Guide[]
}
