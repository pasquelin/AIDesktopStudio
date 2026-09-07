import { VIEW_DISTANCE } from '@shared/domain/renderPolicy'
import {
  Color,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three'
import { type OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { type Gesture } from './gestures'
import { emptyGpuStats, type GpuStats } from './gpuStats'
import type { GpuTimer } from './gpuTimer'
import { type PaneLayout, type PaneRect } from './panes'
import { type PointerPosition } from './pointer'
import { ViewportNavigationTarget } from './ViewportNavigationTarget'
import {
  ORIGIN,
  EXTRA_PANE_HEIGHT,
  GPU_TIMED_FRAMES,
  aimPivotAhead,
} from './viewportEngineSupport1'
import type {
  Pinch,
  ViewportEngineOptions,
  ViewportOutput,
  ProjectionKind,
  ViewportCamera,
  InsetPane,
  InsetBlit,
  ExtraPane,
} from './viewportEngineSupport1'

export abstract class ViewportState {
  public abstract pointerNdcOf(
    pointer: PointerPosition,
    inPane?: number,
  ): { x: number; y: number } | null

  public abstract readonly requestCameraRender: () => void

  protected abstract fitProjection(): void

  protected abstract armOrbits(owner: number | null): void

  public abstract readonly requestRender: () => void

  readonly scene = new Scene()

  /** The perspective one is the default, and the only one the two other 3D spaces ever draw with. */
  readonly perspective: PerspectiveCamera

  readonly orthographic = new OrthographicCamera()

  protected projection: ProjectionKind = 'perspective'

  protected renderer: WebGLRenderer | null = null

  protected readonly navigationTarget: ViewportNavigationTarget

  /**
   * The navigation gesture the pointer holds, or `null`. One at a time, and only ever started on
   * a perspective pane — an orthographic one keeps every gesture `OrbitControls` gives it.
   */
  protected drag: {
    readonly kind: Gesture
    readonly pane: number
    readonly pointerId: number
    /** The button that NAMED the gesture. A mouse gives every button one `pointerId`. */
    readonly button: number
    clientX: number
    clientY: number
    /** Where the press was, the pivot being decided from THERE at the first move — see `onNavigate`. */
    pressedAt: PointerPosition | null
    /** Whether a pixel was actually travelled, so a click that never moved publishes nothing. */
    moved: boolean
  } | null = null

  /** The fingers on the surface, written in place: a touch move arrives as often as a mouse one,
   * and a fresh object per move is garbage per move. */
  protected readonly touches = new Map<number, PointerPosition>()

  /** Apart from `drag`, which follows ONE `pointerId` and would steer by whichever hand moved. */
  protected pinch: Pinch | null = null

  protected output: ViewportOutput = {}

  protected controls: OrbitControls | null = null

  protected observer: ResizeObserver | null = null

  protected layout: PaneLayout = 'single'

  /** Pane 0 until a pointer says otherwise, which is the only pane a single layout has. */
  protected active = 0

  /** Whether another gesture holds the pointer — see `freezePanes`. */
  protected frozen = false

  /** Which pane navigation answers in, or `null` where none does — see `armOrbits`. */
  protected armedPane: number | null = 0

  /**
   * Where the pointer last was, kept even while frozen so thawing can re-arm from it. Written in
   * place: this takes every pointer move, and a fresh object per move is garbage per move.
   */
  protected readonly lastPointer: PointerPosition = { clientX: 0, clientY: 0 }

  /** Kept so the listeners posted on it at mount come off at dispose. */
  protected host: HTMLElement | null = null

  /**
   * The views beside the main one, which is always pane 0 and always the one that was already
   * there. Empty in a single layout, so every viewport that never asks for four draws exactly
   * what it drew before — one camera, one render, no scissor.
   */
  protected readonly extras: ExtraPane[] = []

  /** Where each pane sits, in CSS pixels. One entry in a single layout, four in a quad. */
  protected rects: PaneRect[] = []

  /** What `activePaneRegion` answers with, rewritten in place — see the note there. */
  protected readonly activeRegion: PaneRect = { x: 0, y: 0, width: 0, height: 0 }

  /** What the camera preview shows, or `null` when it is closed. */
  protected inset: InsetPane | null = null

  /** Where the preview was last drawn, kept so a frame that changed nothing only composites it. */
  protected insetHeld: WebGLRenderTarget | null = null

  protected insetBlit: InsetBlit | null = null

  /**
   * Whether what the preview shows has moved since it was last drawn.
   *
   * Open by default and closed only by a draw: the cost of one preview too many is a frame, and
   * the cost of one too few is a monitor showing the wrong instant.
   */
  protected insetStale = true

  /** Before any clock there is, so the FIRST preview is never the one the cadence holds back. */
  protected insetDrawnAt = Number.NEGATIVE_INFINITY

  /** The wake that redraws a preview the cap held back, so the last change is never dropped. */
  protected insetCatchUp: ReturnType<typeof setTimeout> | null = null

  /** Read back once per drawn preview rather than allocated — this sits on the frame path. */
  protected readonly insetClear = new Color()

  /** How tall the added views see, in world units. Set by whoever knows what the scene holds. */
  protected extraHeight = EXTRA_PANE_HEIGHT

  protected frame: number | null = null

  /** `null` while the loop is at rest: the next frame is a first frame, not a long one. */
  protected lastTime: number | null = null

  /** What the last drawn frame cost, and what the context holds. `frames` standing still is a
   * viewport that went back to sleep, which is what the loop is meant to do. */
  readonly stats: GpuStats = emptyGpuStats()

  protected gpuTimer: GpuTimer | null = null

  /**
   * Frames still owed a GPU measurement. A timer query is not free — it is asked for only while
   * somebody reads the figure, and `wantsGpuTiming` re-arms it on every read.
   */
  protected gpuFramesWanted = 0

  /** Asks for the GPU time of the next few frames. Called by whoever is about to show it. */
  readonly wantsGpuTiming = (): void => {
    this.gpuFramesWanted = GPU_TIMED_FRAMES
  }

  /** Whether anything but the camera has moved since the last frame drew its shadow maps. */
  protected shadowsStale = true
  protected allShadowsStale = true

  constructor(protected readonly options: ViewportEngineOptions = {}) {
    this.perspective = new PerspectiveCamera(
      options.fieldOfView ?? 60,
      1,
      options.near ?? 0.1,
      options.far ?? VIEW_DISTANCE,
    )
    this.orthographic.near = options.near ?? 0.1
    this.orthographic.far = options.far ?? VIEW_DISTANCE
    this.navigationTarget = new ViewportNavigationTarget({
      pointerNdc: at => this.pointerNdcOf(at),
      pickTargets: () => this.options.pickTargets?.() ?? [],
      selectionCentre: () => this.options.selectionCentre?.() ?? null,
      pivotMode: () => this.options.pivotMode?.(),
      requestRender: () => this.requestCameraRender(),
      onSettled: pane => this.options.onCameraSettled?.(pane),
    })
  }

  /** What the viewport draws with, and what a raycast has to be set from. */
  get camera(): ViewportCamera {
    return this.projection === 'perspective' ? this.perspective : this.orthographic
  }

  /**
   * Swaps the projection, keeping the view still: the new camera takes the old one's placement,
   * and its frustum is sized so that what sits at the orbit target keeps the size it had.
   *
   * The controls are re-aimed rather than rebuilt — an orbit rebuilt mid-session would lose its
   * target, and with it the point the whole gesture turns around.
   */
  setProjection(kind: ProjectionKind): void {
    if (kind === this.projection) return

    const previous = this.camera
    // An orthographic camera zooms by scaling its frustum, never by moving — so what the wheel
    // left on it has no counterpart in one that zooms by moving. Spent as distance rather than
    // dropped: dropped, coming back to perspective threw the view out to where it stood before.
    const leavingOrthographic = this.projection === 'orthographic'
    const zoomToSpend = this.orthographic.zoom

    this.projection = kind
    const next = this.camera
    next.position.copy(previous.position)
    next.quaternion.copy(previous.quaternion)
    if (leavingOrthographic && zoomToSpend > 0 && zoomToSpend !== 1) {
      // The same fallback as `fitProjection`: with no controls, there is no target but the origin.
      const target = this.controls?.target ?? ORIGIN
      // Held inside the camera's own planes, half a plane either side. Nothing bounds an
      // orthographic zoom — `minZoom` is 0 and costs nothing to reach — and a distance spent past
      // `far` clips the target into a black viewport that no further swap recovers. A zoom simply
      // dropped only widened the view; that is the trade this bound keeps on the right side.
      next.position
        .sub(target)
        .divideScalar(zoomToSpend)
        .clampLength(this.perspective.near * 2, this.perspective.far / 2)
        .add(target)
    }
    // Carried over, a zoom from an earlier swap would apply again on top of the frustum just
    // sized for it.
    next.zoom = 1

    // An orthographic pane hands every gesture back to `OrbitControls`, and its `update()` runs
    // again — see `settleOrbit`. A pivot left where the pointer named it would swing the view on
    // the very first frame after the swap.
    if (kind === 'orthographic' && this.controls) aimPivotAhead(next, this.controls.target)

    this.fitProjection()
    if (this.controls) this.controls.object = next
    this.armOrbits(this.armedPane)
    this.requestRender()
  }

  /**
   * The camera was moved rather than turned: the orthographic frustum has to be sized again, and
   * its zoom let go with it. A perspective camera shows something new the moment it moves; an
   * orthographic one shows exactly what it showed, which is how framing a selection did nothing.
   */
  refit(): void {
    this.orthographic.zoom = 1
    this.fitProjection()
  }
}
