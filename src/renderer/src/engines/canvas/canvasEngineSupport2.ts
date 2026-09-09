import { type Container, type RenderTexture, type Sprite } from 'pixi.js'
import { token } from '../core/palette'
import { type Rect, type Transform } from './canvasState'
import { type Corners, type HandleHit, type HandleId } from './handles'
import { resizeCursor, rotateCursor, type Facing } from './cursors'
import { type OverlayColors } from './CanvasOverlay'
import { type Axis } from './guides'
import { PATCH_BUDGET } from './PixelPatches'
import type { Point, Size } from '../core/geometry'
import { isSmartTool, type CanvasTool, type SmartTool } from './canvasTool'
import type { BrushTarget } from './canvasEngineSupport1'

/** The stencil that cuts a clipped layer out of the one below it, and what holds the pair. */
export type ClipProxy = { baseId: string; sprite: Sprite; host: Container }

/** What the pointer is doing, if anything: the gestures are exclusive by construction. */
export type Gesture =
  | { kind: 'none' }
  | { kind: 'pan'; from: Point }
  | { kind: 'guide'; id: string; axis: Axis }
  | { kind: 'paint'; from: Point; target: BrushTarget }
  /** `origin` is where the layer stood when the drag began: every step is absolute from it. */
  | { kind: 'move'; id: string; from: Point; origin: Point }
  | { kind: 'select'; from: Point }
  /** ONE member for both promptable tools: their gesture is the same, only the mask's use parts. */
  | { kind: SmartTool; from: Point; to: Point }
  | { kind: 'comment'; at: Point; points: Point[] }
  /** Drawing a fresh crop frame from `from`; the frame itself lives on past the drag. */
  | { kind: 'crop'; from: Point }
  /** Pulling one grip of the placed crop frame. `origin` is the frame the drag started on. */
  | { kind: 'cropHandle'; handle: HandleId; origin: Rect }
  /**
   * The drag's two points, in document units. `to` is held rather than derived on release: it is
   * the point AFTER shift has been applied, and the layer must store the square that was drawn.
   */
  // `origin` is where the hand PRESSED, kept raw: the box grows away from the far end, so
  // which way it grows changes the moment a drag crosses back over its own anchor.
  | { kind: 'shape'; origin: Point; from: Point; to: Point }
  /** Sizing a caption's box by its diagonal. A drag of nothing at all is a click, which opens one. */
  | { kind: 'text'; from: Point; to: Point }
  /** Pulling one grip of a caption's box. `box` and `origin` are what it stood at when taken. */
  | { kind: 'textBox'; id: string; handle: HandleId; box: Size; origin: Transform }
  /** `origin` is the transform the layer had when the drag began: every step is absolute. */
  | { kind: 'handle'; id: string; handle: HandleId; from: Point; origin: Transform }
  /** Turning by the zone outside a corner. `center` is the middle the layer pivots about. */
  | { kind: 'rotate'; id: string; center: Point; from: Point; origin: Transform }

/** The drag of a promptable tool — a gesture kind and a tool name are the SAME word here. */
export type SmartGesture = Extract<Gesture, { kind: SmartTool }>

export function isSmartGesture(gesture: Gesture): gesture is SmartGesture {
  return isSmartTool(gesture.kind)
}

export const NO_GESTURE: Gesture = { kind: 'none' }

/**
 * The tools that lay a disc down where the hand is, and so the ones the ring stands for. The
 * fill floods a region rather than stamping one, and the shapes are drawn corner to corner:
 * neither says anything about the brush's footprint.
 */
export const RINGED_TOOLS: ReadonlySet<CanvasTool> = new Set(['brush', 'pencil', 'eraser'])

/**
 * The tools that write on the armed layer's surface, and so the ones a layer can refuse. Neither
 * the text tool nor the shape tool is one: each lands a LAYER of its own rather than writing on
 * what is armed, so a padlock on the armed layer has nothing to say about them — and a cursor
 * that answers `not-allowed` over a gesture that works is worse than no cursor at all.
 * The eyedropper reads, and the selection tools carve out a region rather than a layer.
 */
export const WRITING_TOOLS: ReadonlySet<CanvasTool> = new Set(['brush', 'pencil', 'eraser', 'fill'])

/**
 * Which gestures hold a layer open in the history, so releasing one closes its entry. `textBox`
 * calls `beginDrag` like the other three and was missing here, which left the entry open: the two
 * alignment clicks after a box pull carry one id, merged, and went back on a single ⌘Z.
 */
export const LAYER_DRAGS: ReadonlySet<Gesture['kind']> = new Set([
  'move',
  'handle',
  'rotate',
  'textBox',
])

/** Both arms carry `id`, so two hovers compare without pairing their kinds again. */
export function sameHit(one: HandleHit | null, other: HandleHit | null): boolean {
  if (!one || !other) return one === other
  return one.kind === other.kind && one.id === other.id
}

/** What a hover or a press may take hold of, and how the cursor over it should be turned. */
export type HoverBox = { corners: Corners; reach: number; facing: Facing }

/**
 * The layer's own rotation and mirroring turn the arrow, never the geometry of the box: a grip
 * pulls along its nominal direction, and the box's proportions have nothing to say about it.
 */
export function cursorFor(hit: HandleHit, facing: Facing): string {
  return hit.kind === 'rotate' ? rotateCursor(hit.id, facing) : resizeCursor(hit.id, facing)
}

/** Where a surface's picture starts when nothing displaced it — see `resurface`. */
export const ORIGIN: Point = { x: 0, y: 0 }

/** Which token each part of the overlay is painted with. The values live in `index.css`. */
export const OVERLAY_TOKENS: Record<keyof OverlayColors, string> = {
  frame: '--color-border',
  guide: '--color-accent-soft',
  // A step above the chassis, not level with it: the bands sit on the darkest surface of the
  // studio, and at chassis they read as a continuation of it rather than as a scale to measure
  // against. The ticks come up with the background — `border` on `elevated` is barely a shade
  // apart, and graduations nobody can see are the same as no rulers at all.
  rulerBackground: '--color-elevated',
  rulerText: '--color-muted',
  rulerTick: '--color-muted',
  accent: '--color-accent',
  marqueeLight: '--color-marquee-light',
  marqueeDark: '--color-marquee-dark',
  gridCell: '--color-grid-cell',
  gridPixel: '--color-grid-pixel',
  scrim: '--color-scrim',
}

/**
 * Legible on the studio's greys, and only ever used before a canvas exists to read from.
 *
 * Every value restates its token's DARK declaration, and a test pins the pair: `token()` answers
 * empty for a name `index.css` no longer declares, so a renamed token would quietly make this
 * table the real source of the overlay's colours instead of its last resort.
 */
export const FALLBACK_COLORS: OverlayColors = {
  frame: '#34363a',
  guide: 'rgba(52, 110, 242, 0.55)',
  rulerBackground: '#3c3f44',
  rulerText: '#91959b',
  rulerTick: '#91959b',
  accent: '#346ef2',
  marqueeLight: '#ffffff',
  marqueeDark: '#000000',
  gridCell: '#8080808c',
  gridPixel: '#80808047',
  scrim: '#00000099',
}

export const RULER_FAMILY = 'system-ui, sans-serif'

/** `--text-micro` at scale 1, for a canvas not yet in a document — as `FALLBACK_COLORS` is. */
export const RULER_FONT_SIZE = '9px'

export const FALLBACK_RULER_FONT = `${RULER_FONT_SIZE} ${RULER_FAMILY}`

export function readColors(element: HTMLElement): OverlayColors {
  const read = (part: keyof OverlayColors): string =>
    token(element, OVERLAY_TOKENS[part]!) || FALLBACK_COLORS[part]!

  return {
    frame: read('frame'),
    guide: read('guide'),
    rulerBackground: read('rulerBackground'),
    rulerText: read('rulerText'),
    rulerTick: read('rulerTick'),
    accent: read('accent'),
    marqueeLight: read('marqueeLight'),
    marqueeDark: read('marqueeDark'),
    gridCell: read('gridCell'),
    gridPixel: read('gridPixel'),
    scrim: read('scrim'),
  }
}

export const bytesOf = (texture: RenderTexture): number => texture.width * texture.height * 4

/**
 * What the surfaces of departed layers may hold on the card, and it is a SECOND pool beside the
 * undo tiles rather than a share of theirs — a quarter of their budget, so an image tab is
 * capped at `PATCH_BUDGET` + this + its live surfaces, not at twice the tiles.
 *
 * Sized for the gesture it exists for: merging or removing hands back one surface, and the undo
 * that wants it comes within a few steps. Holding a whole flatten of a large document is not
 * what this buys.
 */
export const DEPARTED_BUDGET = PATCH_BUDGET / 4

/**
 * How many engines of this window hold each asset URL.
 *
 * `Assets` is a singleton of the WINDOW, so an engine unloading on its own dispose took the
 * texture away from every other tab still drawing that same picture — the survivor then reloaded
 * and re-decoded it. Counted here because that is where the cache lives: at the module.
 */
const leases = new Map<string, number>()

export function lease(url: string): void {
  leases.set(url, (leases.get(url) ?? 0) + 1)
}

/** Whether that was the LAST holder — the only moment the window's cache may let it go. */
export function released(url: string): boolean {
  const held = (leases.get(url) ?? 1) - 1
  if (held > 0) {
    leases.set(url, held)
    return false
  }
  leases.delete(url)
  return true
}
