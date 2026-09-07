import {
  type AlphaFilter,
  type Application,
  BlurFilter,
  Container,
  Graphics,
  Matrix,
  type RenderTexture,
} from 'pixi.js'
import { type CanvasState, type Rect, type ShapeKind } from './canvasState'
import { type CanvasSelection, type SelectionShape } from './canvasSelection'
import { type Corners, type HandleHit } from './handles'
import type { OverlayColors, OverlayScene } from './CanvasOverlay'
import { CanvasOverlay } from './CanvasOverlay'
import { type PixelPatches } from './PixelPatches'
import { type ShapeGeometry } from './shapeGeometry'
import type { Point, Size } from '../core/geometry'
import { DEFAULT_BRUSH, type BrushSettings } from './brush'
import type { CanvasTool } from './canvasTool'
import { DEFAULT_VIEW, type CanvasView, type Viewport } from './viewport'
import type {
  CanvasEngineOptions,
  LayerSurface,
  PaintSurface,
  AdjustPass,
} from './canvasEngineSupport1'
import { NO_GESTURE, FALLBACK_COLORS, FALLBACK_RULER_FONT } from './canvasEngineSupport2'
import type { ClipProxy, Gesture } from './canvasEngineSupport2'

export abstract class CanvasStateBinding {
  protected abstract scene(): OverlayScene | null

  protected app: Application | null = null

  protected host: HTMLElement | null = null

  protected readonly world = new Container()

  protected readonly surfaces = new Map<string, LayerSurface>()

  /**
   * Surfaces of layers that left the stack, held in case they come back. Merging, flattening and
   * removing a layer are all undoable, and the tree an undo restores says nothing about pixels:
   * destroyed here, a layer came back holding its fill and nothing that had been painted on it.
   *
   * Oldest evicted first, under the same budget as the undo tiles. What eviction costs is the
   * undo of a very old merge on a very large document, which is the same bargain `PixelPatches`
   * already makes — and the alternative is holding every departed texture for the session.
   */
  protected readonly departed = new Map<string, LayerSurface>()

  /** What `departed` holds, in bytes — kept running rather than re-summed on every insert. */
  protected kept = 0

  /** The pointer this panel holds for the length of a gesture — see `capture`. */
  protected captured: number | null = null

  /** Every URL this engine put in the window's asset cache, so `dispose` can take them back. */
  protected readonly loaded = new Set<string>()

  /** The viewport the world was last moved to — see `applyViewport`. `null` until the first one. */
  protected applied: Viewport | null = null

  /** Wheel travel not yet worth a stop — see `wheelStop`. */
  protected wheelDebt = 0

  /**
   * Where the picture actually landed inside each layer's surface — what `containIn` worked out
   * when it was drawn, kept so the handles can grip the photo rather than the document.
   *
   * Derived, never stored: `loadInto` fills it from `layer.source` on every mount, every undo and
   * every detach, so a document rebuilt from its manifest arrives with the same answer. Invariant
   * 3 holds — nothing here is a fact the state does not already carry.
   */
  protected readonly contents = new Map<string, Rect>()

  /** Families already asked of the page, whether they arrived or not — see `registerFace`. */
  protected readonly faces = new Set<string>()

  protected readonly groups = new Map<string, Container>()

  /** One per clipped layer, keyed by it: a run of three on one base takes three proxies. */
  protected readonly clips = new Map<string, ClipProxy>()

  /** Built on the first isolated group, and only then: most documents never hold one. */
  protected isolation: AlphaFilter | null = null

  /**
   * The stencil pass in flight, the selection it was cut from, and the stencil it owns. Held as
   * the triple because they are not the same thing to free: the holder's other children are
   * borrowed — the brush's stamp lives as long as the engine — and only the stencil is the
   * pass's own. `of` keeps it while that very selection object is still the one.
   */
  protected clipping: { of: CanvasSelection; holder: Container; stencil: Graphics } | null = null

  /** One grading pass per adjustment layer, holding the filter it applies. */
  protected readonly adjustments = new Map<string, AdjustPass>()

  /** What each drawn layer — a caption, a shape — was last rasterized from, so a redraw is rare. */
  protected readonly drawings = new Map<string, string>()

  /** Regions asked of masks that did not exist yet — see `fillMaskFromSelection`. */
  protected readonly pendingMaskFills = new Map<string, Exclude<CanvasSelection, null>>()

  /** Pictures composed for layers that do not exist yet — see `flattenInto`. */
  protected readonly pendingPictures = new Map<string, RenderTexture>()

  /**
   * Saved pixels waiting for the surface they belong to. The document layer writes the stack into
   * the store, and the engine only hears about it a React commit later — so a picture read off the
   * disk almost always arrives before the layer it fills.
   */
  protected readonly pendingSnapshots = new Map<string, Uint8Array<ArrayBuffer>>()

  protected readonly stamp = new Graphics()

  /**
   * What softens the edge of a dab. One instance, tuned when the brush changes and never per
   * dab: a filter rebuilt inside a `pointermove` would recompile a shader hundreds of times
   * across one stroke.
   */
  protected readonly softener = new BlurFilter({ strength: 0, quality: 2 })

  /** The spread currently hung on the stamp, in document pixels. `dab` reads it rather than
   * asking again: the number that sets the filter and the number that sizes the undo box are
   * the same number, and two callers of one formula are two chances to disagree. */
  protected spread = 0

  /** Carries the map back into a surface's own pixels — see `inSurfaceSpace`. */
  protected readonly paintSpace = new Container()

  protected readonly paintMatrix = new Matrix()

  protected readonly overlay = new CanvasOverlay(() => this.scene())

  /** Built with the renderer, in `mount`: a tile is a texture, and there is none before then. */
  protected patches: PixelPatches | null = null

  protected resizer: ResizeObserver | null = null

  protected stopPaletteWatch: (() => void) | null = null

  /** The pointer, so a click before React has armed anything cannot write on the picture. */
  protected tool: CanvasTool = 'move'

  protected painting: PaintSurface = 'pixels'

  protected brush: BrushSettings = DEFAULT_BRUSH

  protected state: CanvasState | null = null

  protected view: CanvasView = DEFAULT_VIEW

  protected hostSize: Size = { width: 0, height: 0 }

  protected colors: OverlayColors = FALLBACK_COLORS

  protected rulerFont = FALLBACK_RULER_FONT

  /** What the graduations are written in. `undefined` is the host's locale; `''` would throw. */
  protected language: string | undefined

  /** Read on resize rather than per event: `getBoundingClientRect` forces a layout. */
  protected bounds: DOMRect | null = null

  /** The tree's shape, as `placement` spells it: what tells a restack apart from a repaint. */
  protected stacking = ''

  protected gesture: Gesture = NO_GESTURE

  protected hover: HandleHit | null = null

  /** Whether the armed tool is currently saying it can do nothing here — see `refuses`. */
  protected refused = false

  /**
   * The last refusal, and what it was computed from. Memoised for the same reason `corners` is:
   * answering it walks the layer tree and inverts a matrix, and `hovering` runs per pointer move.
   */
  protected refusal: {
    of: CanvasState | null
    tool: CanvasTool
    painting: PaintSurface
    value: boolean
  } | null = null

  /**
   * The armed layer's corners, derived once per state. Reaching a layer flattens the whole tree,
   * and both the hover test and the overlay frame want the same answer on the same pointer move.
   *
   * Keyed on the state's identity, as `apply` keys its own work: `apply` replaces it wholesale,
   * so the document's size and the armed id ride along with the tree.
   */
  protected corners: { of: CanvasState | null; tool: CanvasTool | null; box: Corners | null } = {
    of: null,
    tool: null,
    box: null,
  }

  protected pointer: Point | null = null

  protected selection: CanvasSelection = null

  /** Which of the three the region tool draws. Pushed in by the bar, like the tool itself. */
  protected selectionShape: SelectionShape = 'rect'

  protected shapeKind: ShapeKind = 'rectangle'

  protected shapeSides = 5

  /** The shape being dragged, drawn in the overlay until the hand comes up. */
  protected pending: ShapeGeometry | null = null

  /** The box a text drag is sizing, framed in the overlay until the hand comes up. */
  protected textBox: Rect | null = null

  /** The caption a field is typing: drawn by that field, so its own sprite stands aside. */
  protected editing: string | null = null

  /** The paragraph captions holding more words than their box shows — the ⊞ grip says so. */
  protected readonly overflowing = new Set<string>()

  /**
   * The crop frame, once placed. Outlives its drag on purpose — that is what makes the grips
   * real, and what ⏎ applies and ⎋ drops. Session state, like the selection: a frame nobody
   * committed is not something ⌘Z should have to know about.
   */
  protected cropping: Rect | null = null

  /** Wrapped, so a pending `null` is told apart from nothing pending — see `publishSelection`. */
  protected publishingSelection: { selection: CanvasSelection } | null = null

  protected selectionFrame = 0

  /** Moved locally, published to React once a frame — see `moveTo`. */
  protected publishing: Viewport | null = null

  /** The last one React was told about, so its echo can be told apart from a command. */
  protected published: Viewport | null = null

  protected publishFrame = 0

  /** Held space pans whatever the tool, as it does in every editor. */
  protected spacing = false

  /** The view has never been framed on the document, so the first size does it. */
  protected framed = false

  /**
   * Bumped by every `mount` and every `dispose`. Compared after the `await` in `mount`: a stale
   * continuation must not claim a host that a newer mount — or a dispose — has already taken.
   */
  protected mounting = 0

  constructor(protected readonly options: CanvasEngineOptions) {}
}
