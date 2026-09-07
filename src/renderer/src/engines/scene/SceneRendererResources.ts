import type { ForeignClip } from './animation'
import {
  type Box3,
  Frustum,
  type GridHelper,
  LineBasicMaterial,
  Matrix4,
  type Object3D,
  Vector4,
} from 'three'
import { type TransformControls } from 'three/addons/controls/TransformControls.js'
import { type ViewHelper } from 'three/addons/helpers/ViewHelper.js'
import { type SphericalAngles } from '@shared/domain/angles'
import { DEFAULT_LOOK } from '../viewport/lookAround'
import { type AidPalette } from './viewportAids'
import { type ViewportCamera } from '../viewport/ViewportEngine'
import { type SceneNode } from './sceneState'
import type { FontLibrary } from '../core/fonts'
import { type RefCache } from '../core/refCache'
import { createPaneMemory } from './paneDress'
import { createPaneMaterials, type PaneMaterials } from './paneMaterials'
import { EMPTY_STATS, type SceneStats } from './sceneStats'
import { DEFAULT_PANE_VIEWS, type PaneView } from './sceneView'
import { type DisplayMode } from '@shared/domain/scene'
import { type Retarget } from './retarget'
import { type IkBinding } from '../character/ik'
import { type BoneJoints } from './boneJoints'
import { type BoneShapes } from './boneShapes'
import { type SkinWeights } from '../character/skinWeights'
import { type BvhBuilder } from './bvhBuilder'
import './bvhPatches'
import { type CsgEvaluator } from '../csg/csgEvaluator'
import { createGeometryCache, type GeometryCache } from './geometryCache'
import { type InstancedGroups, type ShadowThrow } from './grouping'
import { type TransformMode, type TransformSpace } from './gizmoTarget'
import { NOTHING_SNAPPED, type Snapping } from '@shared/domain/snap'
import type { Marquee } from './sceneRendererSupport1'
import { FirstPersonBody } from './FirstPersonBody'
import { SceneRendererState } from './SceneRendererState'

export abstract class SceneRendererResources extends SceneRendererState {
  protected readonly firstPersonBody = new FirstPersonBody()
  /**
   * Whether the camera actually moved while the button was down. The pointer alone cannot say:
   * a flight is driven by the keyboard, so letting go of `W` before the button — the ordinary
   * way to end one — leaves a release that never moved a pixel, and every flight ended in a menu.
   */
  protected flew = false

  /** Armed persistent navigation. `flownWith` stays null throughout: that one records a BUTTON. */
  protected navigating = false

  /** Whether the capture was actually granted. A refused mode must not move anybody's pivot. */
  protected captured = false

  /** Whether a running game is writing the camera — a third gesture that owns it, see `placeView`. */
  protected viewDriven = false
  /** The lens the driven view asked for, which a `configure` must not undo while it is held. */
  protected drivenLens: number | null = null

  protected driveLens(): void {
    this.viewport.setFieldOfView(this.drivenLens ?? this.view.fieldOfView)
  }

  /** Where the head looks while the pointer is captured. Read off the camera when the mode opens. */
  protected look: SphericalAngles = DEFAULT_LOOK

  /** What the wheel left this session at. `configure` drops it, so an edited preference wins. */
  protected sessionFlySpeed: number | null = null

  protected gizmo: TransformControls | null = null

  /**
   * The rectangle handed to the gizmo, rewritten in place: this is set on every pointer move, and
   * `activePaneRegion` writes into a rect of its own for the same reason.
   */
  protected gizmoRegion = new Vector4()

  protected viewHelper: ViewHelper | null = null

  protected grid: GridHelper | null = null

  /**
   * Two things move separately and are read by different passes, which is why they are two flags
   * and not one: WHAT the scene holds, which the counters read, and WHERE it stands, which the
   * shadow reach reads. A pose displaces without adding; hiding a mesh subtracts without moving.
   */
  protected contentChanged = true

  protected placementChanged = true

  /**
   * Read by the grouping, which is NOT behind the same switch as the counters: turning the
   * statistics off gives back a walk, it must never change what the GPU is asked to draw.
   */
  protected groupingStale = true

  /** Nodes that only MOVED since the last grouping — their slots are still theirs. */
  protected movedNodes = new Set<string>()

  /**
   * What hangs from each node, by id. Read off the DOCUMENT rather than the graph: a body drawn
   * by a group is held out of its parent's children, so a walk of the objects cannot answer.
   * Rebuilt with the groups, which is the one moment a parent can have changed.
   */
  protected childNodes = new Map<string, string[]>()

  /**
   * The box the shadow frusta are cut from, held across passes. A move only ever GROWS it; it is
   * dropped when the content changes, which is the one thing that can make it shrink.
   */
  protected shadowBounds: Box3 | null = null

  /**
   * Where a shadow falls, for a grouping that hides by the CAMERA's frustum: what it takes off
   * screen it takes out of the shadow pass too. `null` when no light throws one.
   */
  protected shadowThrow: ShadowThrow | null = null

  /**
   * The camera the zone was last narrowed to. A preview narrows it to ITS own on every frame it
   * is shown, and a zone left there makes the next pane widen it again — which reads as « cells
   * moved » and redraws every shadow map, on a scene where nothing moved at all.
   */
  protected zonedTo: ViewportCamera | null = null

  /**
   * Whether the parent pass has anything to walk. Only content can change where a node hangs —
   * `keepsItsGroup` reads `parentId`, so a node that merely MOVED kept the parent it had.
   */
  protected hangAll = true

  /** What the model costs, held between the passes that cannot have changed it. */
  protected modelStats: SceneStats = EMPTY_STATS

  protected runtimeModelStats: SceneStats = EMPTY_STATS

  protected runtimeGeometryBytes = 0

  protected runtimeProfileStale = true

  protected readonly profileFrustum = new Frustum()

  protected readonly profileView = new Matrix4()

  protected mode: TransformMode = 'select'

  protected snapping: Snapping = NOTHING_SNAPPED

  protected space: TransformSpace = 'world'

  /** Held so leaving `select` can re-arm the gizmo without waiting for the next `apply`. */
  protected selectedIds: readonly string[] = []

  /**
   * The rectangle a bare left button is dragging, pinned to the pane it STARTED in: re-reading
   * the pane per move measures the second half of it against another camera.
   */
  protected marquee: Marquee | null = null

  /** The frame that will publish the outline, so a pointer faster than the screen posts once. */
  protected marqueePending: number | null = null

  /** The nodes as the document orders them — what an export lists them by, see `exportTo`. */
  protected documentOrder: readonly SceneNode[] = []

  /** Empty until mounted: the palette is only readable once a styled canvas exists. */
  protected meshColor = ''

  /** What a camera body and a bulb's cap are FILLED with, read off the palette beside `meshColor`. */
  protected markerColor = ''

  /** And what outlines them: the edges are what carry the shape where no lamp lights it. */
  protected markerEdge = ''

  /** What a shape marked as a TOOL is painted in — see `applyNegative`. */
  protected negativeColor = ''

  /** What a rail's TANGENTS are painted in, apart from its anchors — see `dressWithRail`. */
  protected handleColor = ''

  /** The band wearing a shape built for a DRAG rather than read from the document, if any. */
  protected previewedRail: string | null = null

  /** What its FIRST anchor is painted in: which end a run starts from is what says its direction. */
  protected startColor = ''

  /** One mode per pane, main view first. A single-view scene reads index 0 and nothing else. */
  protected displays: DisplayMode[] = ['shaded']

  /** Whether the edges are rebuilt as quads. Never real quads — see `applyWireOverlay`. */
  protected quadEdges = false

  /** What each view shows. The main one is free until something says otherwise. */
  protected paneViews: PaneView[] = [...DEFAULT_PANE_VIEWS]

  /** One line material for every overlay: they all draw the same edges in the same colour. */
  protected wireMaterial = new LineBasicMaterial()

  /** The clay, matcap and density materials a view paints with instead of the model's own. */
  protected paneMaterials: PaneMaterials = createPaneMaterials()

  /** What each mesh wore, and which lights the material preview put out — see `pane-dress`. */
  protected paneMemory = createPaneMemory()

  protected bvh!: BvhBuilder

  protected csg!: CsgEvaluator

  /** One shape per distinct descriptor, lent to every node wearing it. */
  protected shapes: GeometryCache = createGeometryCache()

  protected instances!: InstancedGroups

  /** Nodes whose cut is out. Holds which side owes the cache its reference. */
  protected cutting = new Set<string>()

  protected skin!: SkinWeights

  protected retarget!: Retarget

  /**
   * Which foreign clips a node holds a reference on, by key, and where each was read from. A
   * block plays nothing until its clip lands, and every `apply` would otherwise load again.
   */
  protected retargeting = new Map<string, Map<string, AbortController>>()

  protected cancelRetargets(nodeId?: string): void {
    for (const [id, requests] of this.retargeting) {
      if (nodeId !== undefined && id !== nodeId) continue
      for (const request of requests.values()) request.abort()
      this.retargeting.delete(id)
    }
  }

  protected bundled = new Map<string, Map<string, string>>()
  /** What a running game's state machine needs on each model, beside what its band names. */
  protected graphClips = new Map<string, readonly ForeignClip[]>()

  /**
   * One read per animation FILE, however many characters play it — two dancers are one parse.
   *
   * Kept while a block still names it rather than freed after the retarget: what costs is the
   * read, and the second character to be given the same walk is exactly the case this closes.
   */
  protected clipSources!: RefCache<Object3D>

  /** The binds still running, so a model that leaves the stage takes its own off the worker. */
  protected skinning = new Map<string, AbortController>()

  /** One solver per model that reaches for something. Absent is the common case and costs nothing. */
  protected iks = new Map<string, IkBinding>()

  /** The joints of each drawn skeleton, refreshed with the pose. Beside the helper they double. */
  protected joints = new Map<string, BoneJoints>()

  /** The bones themselves, drawn as solids: a line says nothing about which way a bone faces. */
  protected boneSolids = new Map<string, BoneShapes>()

  protected fonts!: FontLibrary

  protected stopPaletteWatch: (() => void) | null = null

  /** Set by `prepareOffscreen`: what stops the backdrop being painted over a montage. */
  protected transparent = false

  /**
   * 🛑 Five `getComputedStyle` calls, kept until the theme moves. `refreshAids` runs on every
   * state change — a selection, a frame of a slider drag — and no longer bows out early once a
   * scene holds a walking body, so reading them per call forced five style recalcs per frame.
   *
   * Off the CANVAS and never `cachedToken`, which reads the main document's root: a detached
   * panel paints from a window of its own.
   */
  protected aidPaletteHeld: AidPalette | null = null
}
