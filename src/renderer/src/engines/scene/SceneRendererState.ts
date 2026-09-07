import {
  Box3,
  type CameraHelper,
  Object3D,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  type Vector3 as ThreeVector3,
} from 'three'
import { type ViewHelper } from 'three/addons/helpers/ViewHelper.js'
import type { MotionId } from '@shared/domain/shortcut'
import { SCHEME_OF, type NavigationScheme } from '@shared/domain/navigationPreset'
import type { PointerPosition } from '../viewport/pointer'
import {
  DEFAULT_WORLD,
  SHADOW_TEXTURE_SLOTS,
  type SceneWorld,
  type TextureSlot,
  type Transform,
} from '@shared/domain/scene'
import { createGroundPlane } from './groundPlane'
import { type ReliefSurface } from './reliefSurface'
import { type ScatterSurface } from './scatterSurface'
import { createViewportAids, type AidRigs } from './viewportAids'
import { NOTHING_ISOLATED, type Isolation } from './isolation'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { type ViewportEnvironment } from '../viewport/environment'
import { type SkyBinding } from '../viewport/skyBinding'
import { ViewportEngine, type DrawRequest, type ViewportCamera } from '../viewport/ViewportEngine'
import { type SceneNode } from './sceneState'
import { createAnimatedStacks } from './animatedStack'
import { type LightHelper } from './threeFactory'
import { type MaterialTextures, type SpriteTexture } from './materialTextures'
import type { EnvironmentDress } from '@shared/domain/skybox'
import { type ModelTextures } from './modelTextures'
import { createSkySun, type SkySun } from './skySun'
import { type GltfSource } from './gltfSource'
import { SceneAnimations } from './animation'
import { postAt } from './animationEval'
import { type PostComposer } from '../postfx/PostComposer'
import { EMPTY_TIMELINE, type AnimationTimeline } from '@shared/domain/animation'
import { type ModelCache } from './modelCache'
import { ownedByAnotherNode } from './shadows'
import { type PreviewWatch } from './sceneView'
import { type BoneAxis } from '@/engines/character/boneRest'
import './bvhPatches'
import { type TextureCache } from './textureCache'
import type { SceneRendererOptions, ViewportOptions } from './sceneRendererSupport1'
import { withEveryLayer, NO_RIGS } from './sceneRendererSupport2'
import type { PickedPathPoint } from './sceneRendererSupport2'

export abstract class SceneRendererState {
  protected abstract advance(delta: number): boolean

  protected abstract viewHelper: ViewHelper | null

  protected abstract dressPane(index: number, camera: ViewportCamera): boolean

  protected abstract readonly onPointerAim: (event: PointerEvent) => void

  protected abstract hideWorkshop(camera?: ViewportCamera): () => void

  protected abstract compose(request: DrawRequest): boolean

  protected abstract reportCameraSettled(pane: number): void

  protected abstract selectionCentre(): ThreeVector3 | null

  protected abstract spendWheelOnSpeed(event: WheelEvent): boolean

  protected abstract redraw(): void

  /** Narrows the shadow pass of ONE frame to the lights that moved, then puts the scene back. */
  protected abstract limitShadowFrame(refreshAll: boolean): () => void

  protected refreshChangedShadows(): void {
    this.viewport.invalidateInset()
    this.viewport.requestShadowRender()
  }

  protected refreshWithoutShadows(): void {
    this.viewport.invalidateInset()
    this.viewport.requestCameraRender()
  }

  protected refreshMaterialTexture(slot: TextureSlot): void {
    if (SHADOW_TEXTURE_SLOTS.includes(slot)) this.redraw()
    else this.refreshWithoutShadows()
  }

  protected options!: SceneRendererOptions

  protected viewport = new ViewportEngine({
    onFrame: delta => this.advance(delta),
    onOverlay: renderer => this.viewHelper?.render(renderer),
    onPane: (index, camera) => this.dressPane(index, camera),
    // Before `TransformControls` reads the same event — see `onPaneArmed`, which says why the
    // viewport owns this call rather than a listener of this file.
    onPaneArmed: event => this.onPointerAim(event),
    // A preview shows what the camera FILMS: the same pass the film and the montage take.
    onInset: camera => this.hideWorkshop(camera),
    // Every surface — the panes, the preview, the film — reaches ONE composer through here, so
    // an effect cannot differ between the editor and the render. See § 26 of the specification.
    onDraw: request => this.compose(request),
    onShadowFrame: refreshAll => this.limitShadowFrame(refreshAll),
    // Read back rather than computed here: only the controls know where an orbit ended up.
    onCameraSettled: pane => this.reportCameraSettled(pane),
    // The nodes alone, and the helpers on purpose: a lamp's glyph is a place one looks AT, never
    // a surface one lands the pivot on.
    pickTargets: () => [...this.objects.values()],
    // Blender's Navigation panel, under the two names it gives them — see `orbitPivot`.
    scheme: () => this.scheme,
    pivotMode: () => ({
      aroundSelection: this.view.orbitAroundSelection,
      underCursor: this.view.orbitUnderCursor,
    }),
    selectionCentre: () => this.selectionCentre(),
    onWheel: event => this.spendWheelOnSpeed(event),
    // Only here: the texture and skybox viewports show what they show without any light told to
    // cast, so a depth pass per frame would buy them nothing.
    shadows: true,
  })

  /**
   * Replaced by `configure` before the first frame; these keep the engine usable without it.
   *
   * Copied rather than referenced: `configure` swaps the whole object today, but a field written
   * in place would otherwise reach through into what every window opens on.
   */
  protected view: ViewportOptions = { ...DEFAULT_SETTINGS.three }

  /**
   * Which application the view is driven like. Composed at `configure` and not per call: the
   * flight reads it once a frame and the gestures once a press, for a value that moves on a
   * settings write.
   */
  protected scheme: NavigationScheme = SCHEME_OF.studio

  /**
   * Both raycasters read EVERY layer, the camera's and the one instancing moves meshes to: a
   * repeated shape is drawn by one instance and picked on its own mesh — see `instancing.ts`.
   */
  protected raycaster = withEveryLayer(new Raycaster())

  /**
   * The surface snap's own, never the shared one: that one's `Line` and `Points` thresholds are
   * widened by whoever picked last, and a downward ray would then meet a rail before the floor.
   */
  protected surfaceRay = withEveryLayer(new Raycaster())

  protected surfaceBox = new Box3()

  protected surfaceFrom = new Vector3()

  /** The slope the ray met, in world space. Scratch: it is measured once per frame of a drag. */
  protected surfaceNormal = new Vector3()

  /** Refilled rather than rebuilt, for the same reason — see `surfaceRoots`. */
  protected surfaceScope: Object3D[] = []

  /** What the pivot wore when the drag began. A turn composed onto its own result drifts. */
  protected surfaceHeld = new Quaternion()

  /** Scratch for capping the handles to what they hold, so a frame allocates nothing. */
  protected gizmoBox = new Box3()

  protected gizmoSpan = new Vector3()

  protected gizmoEye = new Vector3()

  protected gizmoSpot = new Vector3()

  protected pointer = new Vector2()

  protected objects = new Map<string, Object3D>()

  /** A shadow walk stops here: what hangs under a node carries that node's flags, not its parent's. */
  protected belongsToAnotherNode = ownedByAnotherNode(id => this.objects.get(id))

  protected helpers = new Map<string, LightHelper>()

  /** The lights whose map the next pass has to draw again, when it is not all of them. */
  protected changedShadowLights = new Set<Object3D>()

  /** The frustum drawn under each camera of the scene — what makes one clickable. */
  protected frustums = new Map<string, CameraHelper>()

  /**
   * The body a camera and a lamp are DRAWN as, by node. Kept the way the helpers are, and for the
   * same two reasons: a render hides all of them at once, and finding them by walking each node's
   * children would be a scan per frame.
   */
  protected markers = new Map<string, Object3D>()

  /** The texture slots of each mesh, and the references they hold on the cache. */
  protected textures = new Map<string, MaterialTextures>()

  /** The same, for the one map a sprite wears. Apart, so each map stays exactly typed. */
  protected spriteMaps = new Map<string, SpriteTexture>()

  /** The project's maps put over the ones a model's file carries, per node. See `model-textures`. */
  protected modelMaps = new Map<string, ModelTextures>()

  /** Last node applied per id, compared by reference to skip what has not changed. */
  protected applied = new Map<string, SceneNode>()

  protected textureCache!: TextureCache

  protected modelCache!: ModelCache
  /** The cache key each model node holds: versioned, so `release` gives back what was taken. */
  protected modelKeys = new Map<string, string>()

  protected gltf!: GltfSource

  /** The clips of every model on stage. Apart from the nodes: see `animation.ts`. */
  protected animations = new SceneAnimations()

  /** The cameras the shots named last pass, so one they let go of can be put back where it was. */
  protected railedCameras = new Set<string>()

  protected showSkeletons = false

  /**
   * Whether a click picks a BONE rather than a mesh.
   *
   * The two are exclusive on purpose, which is what answers the reason bones were taken off the
   * raycaster: a rig's bones cross every mesh they drive, so offering both at once means a click
   * that lands on whichever the ray happens to meet first.
   */
  protected poseMode = false

  protected restEditing = false

  /** Where what is FOLLOWED stood when the last frame drew — `null` while nothing is. */
  protected followed: ThreeVector3 | null = null

  /** Whose centre that was. A selection that CHANGED re-seats it; moving to the new one would
   * carry the view the whole way between two bodies in a single frame. */
  protected followedIds: readonly string[] = []

  /** The bone the gizmo is aimed at while the pose mode is on, and what a release reports. */
  protected pickedBone: { nodeId: string; bone: string } | null = null

  /** The control point of a rail the gizmo holds. Never a node — see `setPickedPathPoint`. */
  protected pickedPathPoint: PickedPathPoint | null = null

  /** The tracks of the document, and where the head stands over them. */
  protected timeline: AnimationTimeline = EMPTY_TIMELINE

  /** Whether moving the head can move a shadow at all, read off the timeline by `apply`. */
  protected playheadMovesShadows = false

  /** Built at mount, when there is a renderer to build passes with. */
  protected post: PostComposer | null = null

  /**
   * The temporary comparison — hold to see the frame without its composition.
   *
   * Session state, never the document: § 2 asks for a look at what is underneath, not for an edit
   * that ⌘Z would have to take back. The stored `enabled` of a stack is the other switch, and it
   * IS an edit.
   */
  protected bypassed = false

  /** Per subject, the stack `postAt` answered and everything it was answered FROM. */
  protected animated = createAnimatedStacks(postAt)

  protected playhead = 0

  /** The frame of the preview loop, so switching block or stopping cancels the one running. */
  protected previewFrame = 0

  /** The pose a preview stands still at, which nothing else writes again. See `holdPreview`. */
  protected heldPreview: PreviewWatch | null = null

  /** Where each driven bone rested when it arrived, keyed `<nodeId>/<bone>`. See `applyBonePoses`. */
  protected boneRests = new Map<string, Transform>()

  /** The rest a fitted rig gave each of its bones, per node — what a leash is measured from. */
  protected rigRests = new Map<string, Map<string, Transform>>()

  /** The axes a joint dragged must not leave. Empty until a window asks: a scene poses freely. */
  protected heldBoneAxes: readonly BoneAxis[] = []

  /** Whether the pivot is standing in for the picked joint. See `articulateTowards`. */
  protected boneHandle = false

  protected held = new Set<MotionId>()

  protected environment: ViewportEnvironment | null = null

  protected sky!: SkyBinding

  /** What lights the document and hangs behind it, as last applied. See `applyWorld`. */
  protected world: SceneWorld = DEFAULT_WORLD

  /** The document's own ground. Beside the nodes like the grid, and never one of them. */
  protected ground = createGroundPlane()

  /** Built by the constructor, which alone knows whether one was handed in — see there. */
  protected relief!: ReliefSurface
  protected scatter!: ScatterSurface

  /** The sun the sky it names describes. A node of the scene, so it is born with the renderer. */
  protected sun: SkySun = createSkySun(this.viewport.scene)

  /** What the scene was last lit ON, so a pass that changes nothing costs nothing. */
  protected lit: { dress: EnvironmentDress | null; intensity: number; rotation: number } | null =
    null

  /** Boxes, origins and normals. Hung beside the nodes for the reason the ground is not. */
  protected aids = createViewportAids()

  /** What the last state asks to be DRAWN off its components, so `refreshAids` knows there is
   * something to draw at all. */
  protected rigs: AidRigs = NO_RIGS

  /** What the VIEWPORT hides, which is never what the document hides — see `isolation.ts`. */
  protected isolation: Isolation = NOTHING_ISOLATED

  /** What the gizmo holds when more than one node is selected. See `pivot.ts`. */
  protected pivot = new Object3D()

  /** Whether the gesture in progress has moved anything at all. A bare click has not. */
  protected dragged = false

  /** Where the left button went down, so the release can tell a click from an orbit. */
  protected pressed: PointerPosition | null = null

  /**
   * Where the button that flies went down, or nothing while none is held. A flight that never
   * left the pixel it started on is a click: the right button raises the node menu, the left
   * one picks.
   */
  protected flownFrom: PointerPosition | null = null

  protected flightPointer: (PointerPosition & { pointerId: number }) | null = null

  /**
   * Which button armed the flight, and so whether one is under way at all. Either arms it —
   * the left one keeps orbiting and picking exactly as before, it only GAINS the keys.
   */
  protected flownWith: number | null = null
}
