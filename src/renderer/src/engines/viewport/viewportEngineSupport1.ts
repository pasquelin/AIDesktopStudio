import {
  type Color,
  type MeshBasicMaterial,
  type Object3D,
  OrthographicCamera,
  type PerspectiveCamera,
  type Scene,
  Vector3,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three'
import { type OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { type GpuPipeline } from '../gpu/gpuPipeline'
import { type PinchReading } from './pinch'
import { type Gesture } from './gestures'
import { type NavigationScheme } from '@shared/domain/navigationPreset'
import { gazeTargetOf, type PivotMode } from './orbitPivot'
import { type PaneRect } from './panes'

/** A two-finger gesture in flight: its last two readings, and the pane it belongs to. */
export type Pinch = PinchReading & { pane: number; moved: boolean }

/** Where an unmounted viewport orbits, having no controls to hold a target. Never written to. */
export const ORIGIN = new Vector3()

/**
 * The parts of a viewport every workspace repeats: a canvas it owns, a renderer, a camera that
 * follows the element's aspect, orbit controls, and a loop that only runs while something
 * moves. Three workspaces show 3D — the scene editor, textures and skyboxes — and each one
 * writing this again is three chances for them to disagree about resizing or disposal.
 *
 * What it deliberately does not know: gizmos, selection, outliners, grids. Those belong to
 * whoever mounts it, which is why `scene` and `camera` are handed over rather than hidden.
 */

export type ViewportEngineOptions = {
  /**
   * Advances whatever the caller animates, and reports whether it still moves. Returning true
   * keeps the loop alive for another frame; returning false lets the viewport go back to sleep.
   */
  onFrame?: (delta: number) => boolean
  /** Drawn after the scene with `autoClear` off — trihedrons and other screen-space overlays. */
  onOverlay?: (renderer: WebGLRenderer) => void
  /**
   * Called just before each pane is drawn, so whoever owns the scene can say how THIS view shows
   * it, and answering whether that changed what the scene wears — which is what tells the frame
   * its shadow maps are worth drawing again. The one seam that makes a per-view display mode
   * possible: `overrideMaterial` and a camera's layers are read at render time, so a pane's
   * answer only has to hold for its own pass.
   */
  onPane?: (index: number, camera: ViewportCamera) => boolean
  /**
   * Called around the inset pass, and it hands back the call that undoes whatever it did.
   *
   * The seam a preview needs and `onPane` cannot give: a preview shows what the camera FILMS, so
   * the grid and the helpers have to be hidden for that pass and put back for the next — and
   * `onPane` has no symmetrical call after a pane is drawn.
   */
  onInset?: (camera: ViewportCamera) => () => void
  /** Narrows a requested shadow pass, then restores the scene for off-screen renders. */
  onShadowFrame?: (refreshAll: boolean) => () => void
  /**
   * Filmic tone mapping. Off by default because it changes how every existing colour lands,
   * and the scene editor was built and reviewed without it; a viewport that judges an HDR
   * environment turns it on.
   */
  toneMapping?: boolean
  /**
   * Whether the renderer draws shadow maps at all. Off by default, and left off by the two
   * viewports that show one lit object on a studio environment: enabling it costs a depth pass
   * per shadow-casting light, for surfaces that would catch nothing.
   */
  shadows?: boolean
  /**
   * `orbit` circles a target — the scene editor and a texture on its sphere. `none` leaves the
   * camera where it is put, for a viewport whose camera sits at the centre and only turns its
   * head; orbiting with the target pinned at the centre would need the distance locked to
   * nearly zero, which costs the rotation its precision.
   */
  controls?: 'orbit' | 'none'
  /**
   * The hand has let go of the camera. Fired once per gesture, never per frame of it: whoever
   * listens publishes where the view now stands, and a store written sixty times a second
   * would repaint everything reading it for a drag that is not over.
   */
  onCameraSettled?: (pane: number) => void
  /**
   * Called once the pointer has settled which pane is being worked in, and BEFORE any listener of
   * the canvas sees that same event — this runs in the capture phase, on the host.
   *
   * The seam a control that reads its own pointer events needs, `TransformControls` being the one
   * that does: it casts from the camera it is holding at that instant, so whoever hands it that
   * camera has to run first. Left to the caller's own listener, the order would rest on which of
   * the two `mount` calls came first, and nothing would guard it.
   */
  onPaneArmed?: (event: PointerEvent) => void
  /**
   * What the wheel's ray may land the pivot on. Without it the ray would take the grid, a light's
   * helper or the gizmo for scenery, and none of those is a place to aim at.
   */
  pickTargets?: () => Object3D[]
  /**
   * A first refusal on the wheel, for a caller the notches mean something else to — flying, where
   * they set the speed. `true` consumes the event and no dolly happens.
   */
  onWheel?: (event: WheelEvent) => boolean
  /**
   * Centre of what the caller has selected, in world space, or `null` where nothing is. Where the
   * gizmo sits, and what Blender turns around under the name *Orbit Around Selection*.
   */
  selectionCentre?: () => Vector3 | null
  /** The two navigation preferences the pivot cascade reads — see `orbitPivot`. */
  pivotMode?: () => PivotMode
  /** Which application's gestures the buttons answer to — see `navigationPreset`. */
  scheme?: () => NavigationScheme
  /**
   * Draws the scene the way its owner COMPOSES it, and answers whether it drew anything.
   *
   * The one seam through which the viewport, every camera preview and every off-screen render
   * reach the same code — without this engine learning what a post-processing stack is, which is
   * the same line it holds against gizmos and outliners. `false` means « nothing composed », and
   * the plain render happens here.
   */
  onDraw?: (request: DrawRequest) => boolean
  fieldOfView?: number
  near?: number
  far?: number
}

/**
 * Which surface is being drawn, so its owner can answer with the composition that belongs to it:
 * a pane films through the SCENE's, a preview through its camera's, and an off-screen render
 * through whichever camera the film is on at that instant.
 */
export type DrawSurface = 'pane' | 'inset' | 'offscreen'

/**
 * One request to draw the scene somewhere. Sizes are in DEVICE pixels — an effect that reads a
 * resolution reads the one it is actually drawing at, never a CSS measure.
 */
export type DrawRequest = {
  scene: Scene
  camera: ViewportCamera
  surface: DrawSurface
  /** Which pane, for a `pane` request. Zero everywhere else. */
  paneIndex: number
  /**
   * Which node of the document the camera belongs to, when it is one — a preview and an
   * off-screen render film through a camera the document holds, and what that camera composes
   * with lives on the node. `null` for a pane, which looks through the workshop's own.
   */
  cameraNodeId: string | null
  /** `null` is the canvas. */
  target: WebGLRenderTarget | null
  /** Where on the canvas, when only part of it is being drawn. Absent means all of it. */
  rect: PaneRect | null
  width: number
  height: number
}

/**
 * What a viewport drawing for something other than a screen asks for — see `configureOutput`.
 *
 * Both have to be settled before the renderer exists: `alpha` is a context attribute WebGL only
 * reads at creation, and a device ratio applied afterwards would resize a buffer already sized.
 */
export type ViewportOutput = {
  /**
   * Device pixels per CSS pixel. Left to the screen's own by default; a viewport rendering into
   * a video frame wants exactly one, since the frame's size IS the pixel count asked for.
   */
  pixelRatio?: number
  /** Whether the drawing buffer keeps an alpha channel, so what is behind the scene stays clear. */
  alpha?: boolean
}

/** Frames measured after one read: enough to cover a reader polling a few times a second. */
export const GPU_TIMED_FRAMES = 30

/** Seconds. Longer than this and a background tab would fly the camera across the scene. */
export const MAX_DELTA = 0.1

/**
 * How a viewport projects. Perspective everywhere by default: only the scene editor offers the
 * other one, where parallel edges have to read as parallel to judge an alignment.
 */
export type ProjectionKind = 'perspective' | 'orthographic'

export type ViewportCamera = PerspectiveCamera | OrthographicCamera

/** A camera drawn over the panes, in a rectangle of its own — the camera preview. */
export type InsetPane = {
  camera: PerspectiveCamera
  /** Which node of the document that camera IS — what its owner resolves a composition by. */
  cameraNodeId: string | null
  /** In CSS pixels, origin top-left, like every other pane rect. */
  rect: PaneRect
  /**
   * What the preview is cleared to before it draws. A scene with no background of its own is
   * TRANSPARENT, and the panes underneath then showed straight through the picture — a preview
   * one reads the viewport through is not a preview.
   */
  backdrop: Color
  /**
   * Grown to the whole view, which is what lets the panes under it be skipped.
   *
   * Told rather than measured. The rectangle handed over is the INSIDE of the DOM frame, so it
   * is two pixels short of the canvas on every side — a comparison against the canvas therefore
   * answered "no" at every size, and the panes went on being drawn under a picture that hid
   * them whole.
   */
  full: boolean
}

/**
 * How often the preview is redrawn while what it shows keeps changing — a corner monitor at
 * 30 Hz beside a view at 120 reads as live, and costs a quarter as much.
 *
 * A CAP, never a clock: a preview whose content has not moved is not redrawn at all.
 */
export const INSET_CADENCE_MS = 1000 / 30

/** What composites the cached preview: the studio's own full-frame quad, wearing its texture. */
export type InsetBlit = { quad: GpuPipeline; material: MeshBasicMaterial }

/**
 * One of the views beside the main one. It carries both cameras, exactly as the main one does:
 * a quarter set to a side is flat — converging edges are the one thing a side view rules out —
 * but a quarter set free is a second perspective, which is a layout the user may ask for.
 */
export type ExtraPane = {
  perspective: PerspectiveCamera
  orthographic: OrthographicCamera
  projection: ProjectionKind
  controls: OrbitControls | null
  /** A camera of the SCENE this pane draws through instead of its own — see `setPaneCamera`. */
  borrowed: PerspectiveCamera | null
}

/**
 * How tall a pane's frustum is by default, before anything frames a selection into it. Half a
 * dozen studio units: a primitive dropped at the origin lands inside it rather than filling it.
 */
export const EXTRA_PANE_HEIGHT = 6

/** Reused, so lending allocates nothing. How FAR ahead is `PIVOT_AHEAD`, the one such distance. */
export const borrowedAim = new Vector3()

/**
 * Whether `OrbitControls` still owns the gestures of the camera it holds — see `armOrbits`.
 *
 * Disabled, its TOUCH handlers go with it: what a perspective pane does with fingers is read by
 * `navigateByTouch` instead — one turns, two pan and dolly.
 */
export function ownsGestures(controls: OrbitControls): boolean {
  return controls.object instanceof OrthographicCamera
}

/** The same three flags a caller already sets to lock a view down — see `viewFrom`. */
export function allows(orbit: OrbitControls, kind: Gesture): boolean {
  if (kind === 'orbit') return orbit.enableRotate
  if (kind === 'pan') return orbit.enablePan
  return orbit.enableZoom
}

/**
 * Puts a pivot back on the line of sight, keeping the depth it had. What every surface that
 * hands its gestures back to `OrbitControls` has to do first — see `settleOrbit`.
 */
export function aimPivotAhead(camera: ViewportCamera, pivot: Vector3): void {
  pivot.copy(gazeTargetOf(camera.position, camera.getWorldDirection(borrowedAim), pivot))
}

/** The camera an added view is currently drawing through — a borrowed one wins over both. */
export function cameraOf(pane: ExtraPane): ViewportCamera {
  if (pane.borrowed) return pane.borrowed
  return pane.projection === 'perspective' ? pane.perspective : pane.orthographic
}
