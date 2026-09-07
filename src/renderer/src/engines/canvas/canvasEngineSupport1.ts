import {
  type Container,
  type RenderTexture,
  type Sprite,
  type BLEND_MODES,
  type ICanvas,
} from 'pixi.js'
import type { BlendMode } from '@shared/domain/canvasBlend'
import { fontKey } from '@shared/domain/font'
import { type AdjustFilter } from './adjustFilter'
import { type FaceRegistrar } from './canvasFonts'
import {
  IDENTITY,
  type DrawnShape,
  type Layer,
  type Rect,
  type ShapeLayer,
  type TextAlign,
  type Transform,
} from './canvasState'
import { type CanvasSelection } from './canvasSelection'
import { type Affine } from './layerSpace'
import { type Axis } from './guides'
import { shapeGeometry, type ShapeGeometry } from './shapeGeometry'
import type { Point, Size } from '../core/geometry'
import type { CanvasTool } from './canvasTool'
import { type Viewport } from './viewport'

/**
 * What the engine may do to the guides. It builds no id and runs no command: those belong to the
 * document's history, which lives on the React side.
 */
export type GuidePort = {
  /** Returns the id of the guide it created, so the engine can go on dragging it. */
  add: (axis: Axis, position: number) => string
  move: (id: string, position: number) => void
  remove: (id: string) => void
  /** Both ends of a drag: everything between them is one history entry. */
  beginDrag: () => void
  endDrag: () => void
}

/**
 * What the engine may do to the layer stack. Same shape and same reason as `GuidePort`: the
 * engine knows where the pointer went, the document's history knows what that means.
 */
export type LayerPort = {
  /** Absolute, not a step: the commands of one drag merge, and only the last one survives. */
  translate: (id: string, x: number, y: number) => void
  /** Same, for what a grip does: scale, rotation and place all move together. */
  transform: (id: string, transform: Transform) => void
  beginDrag: () => void
  endDrag: () => void
}

export type CanvasEngineOptions = {
  /** Reports the colour under the pointer, so the picker can feed the swatch back. */
  onPick: (color: number) => void
  /**
   * Fires once a stroke is finished, with the id of the patch that can undo it — one history
   * entry per gesture, not per pixel.
   */
  onPixels: (patchId: string) => void
  /** The tiles of that patch have been thrown away: its history entry can no longer be replayed. */
  onPixelsDropped: (patchId: string) => void
  /** Pan and zoom are session state: the engine moves them, React stores them. */
  onViewport: (viewport: Viewport) => void
  /** So is the selection: the engine carves it out, React holds it. */
  onSelection: (selection: CanvasSelection) => void
  /** A document-space prompt for an asynchronous native selection. */
  onSmartSelect: (prompt: { point: Point } | { box: Rect }) => void
  onComment: (at: Point, outline?: readonly Point[]) => void
  /** The host's size, which the zoom commands need: they centre on a panel they cannot see. */
  onHost: (size: Size) => void
  /**
   * A caption the hand asked for: a layer already there to edit, or a fresh box to open one in.
   * The layer it becomes, and the editor it opens, are the stack's to make.
   */
  onText: (asked: { layerId: string } | { at: Point; box: Size | null }) => void
  /**
   * A caption's box, pulled by one of its grips: the new box, and where its top-left corner now
   * sits in the document — a north or west grip moves both at once.
   */
  onTextBox: (layerId: string, box: Size, at: Point) => void
  /** A shape the hand finished drawing, and where its box starts. Same split as `onText`. */
  onShape: (at: Point, drawn: DrawnShape) => void
  /**
   * The frame a crop drag settled on, in document units. Same split as `onText`: the engine
   * knows where the pointer went, the document's history knows what that means.
   */
  onCrop: (rect: Rect) => void
  /**
   * Whether a frame is drawn — not where. It is what a bar needs to offer Accept and Cancel,
   * and ⏎ and ⎋ were the only way to answer one for as long as nobody was told.
   */
  onCropFrame: (framed: boolean) => void
  guides: GuidePort
  layers: LayerPort
  /** Puts an embedded face in the page. Injected because jsdom has no `FontFace` to put it with. */
  addFace: FaceRegistrar
}

/**
 * Declared by the bar, not implemented here. Kept in the union so the registry stays typed, and
 * kept in one place so wiring one is a single deletion.
 *
 * Exported so the bar's registry can be crossed against it: a tool listed here whose button is
 * not greyed arms a gesture `onPointerDown` drops on the floor.
 */
export const UNBUILT_TOOLS: ReadonlySet<CanvasTool> = new Set<CanvasTool>()

/**
 * Pixi's own name for each mode. Total on purpose: a mode added to `BlendMode` and forgotten here
 * must be a compile error, not a layer that quietly composites as `normal`.
 *
 * Only `normal`, `multiply` and `screen` are native GL blends; the other twelve come from
 * `pixi.js/advanced-blend-modes`, which `mount` imports.
 *
 * `hue` is the one exception, and it is deliberate: Pixi 8.19 commented it out of its own union
 * and ships no filter for it, so the literal would not even typecheck.
 */
export const BLEND_BY_MODE: Record<BlendMode, BLEND_MODES> = {
  normal: 'normal',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'normal',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
}

export type LayerSurface = {
  texture: RenderTexture
  sprite: Sprite
  /**
   * Whether the document filled this surface itself, which makes it the authority over the
   * layer's `source`.
   *
   * `source` names where a pixel layer CAME FROM, and the engine reloads it when the surface is
   * born. That is right until the document carries the layer's own pixels — and ⌘S is what makes
   * the two diverge: it writes the flattened stack into that very asset, so a reload would fold
   * the whole picture back into the layer it came from and draw the upper layers over it a
   * second time, further at every open.
   *
   * Held on the surface rather than in a set beside it, so it dies with the texture: a layer
   * that comes back on ⌘Z has no pixels left and its asset is the only picture to draw.
   */
  fromDocument: boolean
}

/** Which of a layer's two surfaces the brush writes on. */
export type PaintSurface = 'pixels' | 'mask'

/**
 * One surface's pixels, on their way to a file or back — a PNG, as bytes.
 *
 * Never base64. A 4K stack of ten layers is hundreds of megabytes of text, held at the same
 * instant by the window that encoded it and the process that decodes it — and a data URL of one
 * would be kept for the session by the loader's cache, which is keyed on the whole string.
 */
export type LayerPixels = {
  layerId: string
  /** A layer keeps two surfaces: the picture, and the mask painted over it. */
  mask: boolean
  /**
   * Over an `ArrayBuffer` and not an `ArrayBufferLike`, which is what makes it a `BlobPart`:
   * spelt loosely, restoring a 4K layer copied the whole of it only to narrow the type.
   */
  data: Uint8Array<ArrayBuffer>
}

/**
 * Where a stroke lands, and how to get there. `toSurface` maps the document onto the surface's
 * own pixels: the sprite that shows them carries the layer's transform, so artwork drawn where
 * the cursor is would otherwise be displaced by exactly that transform.
 *
 * Taken once when the gesture opens rather than per move: the layer cannot be transformed while
 * the pointer is captured, and re-deriving it per `pointermove` was also re-resolving the active
 * layer, which a stroke must not do.
 */
export type BrushTarget = { key: string; surface: LayerSurface; toSurface: Affine }

/**
 * Which transform a surface is placed by. Unlinked means the mask does not follow the layer: it
 * stays where it was painted. Read by the placement and by the way back into the pixels, which
 * have to agree — a brush that disagrees with the sprite paints beside the cursor.
 */
export function surfaceTransform(layer: Layer, mask: boolean): Transform {
  return mask && layer.mask?.linked !== true ? IDENTITY : layer.transform
}

/**
 * A line is a stroke, and the brush size is a diameter: a 24 px brush draws a 6 px line, which is
 * what the same setting gives a dab of ink under a pen.
 */
export function strokeWidth(brushSize: number): number {
  return Math.max(1, brushSize / 4)
}

/**
 * How far a text drag has to reach before it counts as one, in document units. Below it the hand
 * meant a click, and a click opens the default box — a caption three pixels wide is nobody's ask.
 */
export const MIN_TEXT_DRAG = 8

export const sizeOf = (rect: Rect): Size => ({ width: rect.width, height: rect.height })

/** Where a block of words hangs in its box. `justify` fills the width, so it starts at the edge. */
export function alignedIn(align: TextAlign, box: number, block: number): number {
  if (align === 'center') return Math.max(0, (box - block) / 2)
  if (align === 'right') return Math.max(0, box - block)
  return 0
}

/** The shape a layer holds, back as geometry — its two points are already in its own space. */
export function shapeOf(layer: ShapeLayer): ShapeGeometry {
  return shapeGeometry(layer.shape, layer.from, layer.to, {
    sides: layer.sides,
    constrain: false,
  })
}

/**
 * What a drawn layer's texture was last rasterized from — an unchanged key costs no redraw.
 * `null` for a layer that holds its own pixels, which no state can redraw.
 */
export function drawingKey(layer: Layer): string | null {
  if (layer.kind === 'text') {
    return [
      layer.text,
      layer.size,
      layer.color,
      fontKey(layer.font),
      layer.box?.width,
      layer.box?.height,
      layer.align,
      layer.lineHeight,
      layer.tracking,
    ].join('|')
  }
  if (layer.kind !== 'shape') return null

  return [
    layer.shape,
    layer.from.x,
    layer.from.y,
    layer.to.x,
    layer.to.y,
    layer.sides,
    layer.fill,
    layer.stroke?.color,
    layer.stroke?.width,
  ].join('|')
}

/**
 * The same two spellings `blobOf` handles, narrowed to what `createImageBitmap` takes: Pixi
 * publishes `ICanvas`, which is one of these at runtime and neither of them to the compiler.
 */
export function bitmapSourceOf(canvas: ICanvas): HTMLCanvasElement | OffscreenCanvas | null {
  if (canvas instanceof HTMLCanvasElement) return canvas
  return typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas ? canvas : null
}

/**
 * A canvas as PNG bytes. Two spellings and no way round it: a window's canvas answers through a
 * callback, a worker's through a promise, and Pixi publishes both as optional.
 */
export async function blobOf(canvas: ICanvas): Promise<Blob | null> {
  if (canvas.convertToBlob) return await canvas.convertToBlob({ type: 'image/png' })
  const { toBlob } = canvas
  if (!toBlob) return null
  return await new Promise(resolve => {
    toBlob.call(canvas, resolve, 'image/png')
  })
}

/** A grading pass: the container the filter runs over, and the filter itself. */
export type AdjustPass = Container & { filter: AdjustFilter }
