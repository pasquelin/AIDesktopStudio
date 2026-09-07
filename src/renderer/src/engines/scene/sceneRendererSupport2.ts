import {
  Euler,
  type Material,
  Matrix3,
  type Mesh,
  type Object3D,
  Quaternion,
  type Raycaster,
  type Camera,
  Vector3,
  Vector3 as ThreeVector3,
} from 'three'
import { gazeTargetOf } from '../viewport/orbitPivot'
import { type AidBody, type AidRigs } from './viewportAids'
import { cachedOn } from '../core/cachedOn'
import { COMPONENT_DEFAULTS } from '@game/runtime/componentDefaults'
import { numberOf } from '@game/runtime/componentFields'
import type { PaneRect } from '../viewport/panes'
import { type ModelNode, type SceneNode } from './sceneState'
import { isRailAid } from './threeFactory'
import { MARKER_NAME } from './markerPaint'
import { type Projected } from './bonePicking'
import './bvhPatches'
import { createBatchedGroups } from './batching'
import { createCellGroups } from './cellInstancing'
import { type InstancedGroups } from './grouping'
import { createInstancedGroups } from './instancing'
import { createOptimizedGroups } from './optimizedGrouping'
import type { SceneRendererOptions, ViewportOptions } from './sceneRendererSupport1'
import type { PickedPathPoint } from './pickedPathPoint'

export type { PickedPathPoint } from './pickedPathPoint'

/**
 * What a camera LOOKS AT — the pivot brought onto its line of sight. Four readers here take the
 * pivot for that point and restore it by `lookAt`, and the pointer routinely leaves it off axis.
 */
export function lookedAtBy(camera: Camera, pivot: ThreeVector3): ThreeVector3 {
  return gazeTargetOf(camera.position, camera.getWorldDirection(new ThreeVector3()), pivot)
}

/** Where a shot's target stands and where its rail puts it: a camera driven per frame allocates
 * nothing. */
export const aimed = new ThreeVector3()

export const railed = new ThreeVector3()

/** Scratch vectors for the fly loop, which runs every frame while a direction is held. */
export const forward = new ThreeVector3()

export const right = new ThreeVector3()

export const step = new ThreeVector3()

export const flightGaze = new ThreeVector3()

/** Scratch for projecting a bone, so a click over a rig allocates nothing per bone. */
export const BONE_WORLD = new Vector3()

export const BONE_TAIL = new Vector3()

/** Reused by the marquee, which measures every node of the scene in one pass — see `screenBodies`. */
export const BODY_CENTRE = new Vector3()

export const BODY_EDGE = new Vector3()

export const BODY_RIGHT = new Vector3()

export const BODY_UP = new Vector3()

export const BODY_ABOVE = new Vector3()

/** Scratch for turning the bone that arrives at a dragged joint. See `articulateTowards`. */
export const JOINT_WANTED = new Vector3()

export const JOINT_RESTED = new Vector3()

export const JOINT_PIVOT = new Vector3()

export const JOINT_TURN = new Quaternion()

export const JOINT_FRAME = new Quaternion()

export const JOINT_LOCAL = new Quaternion()

/** Scratch for placing a rail or one of its knobs, so a click over one allocates nothing. */
export const RAIL_SPOT = new Vector3()

/** Scratch for the two the fallback plane of a click needs: what it passes through, and its way. */
export const RAIL_ANCHOR = new Vector3()

export const RAIL_FACING = new Vector3()

/** Where the surface snap looks, and what turns a face's own normal into the world's. */
export const DOWNWARD = new Vector3(0, -1, 0)

export const SURFACE_NORMAL = new Matrix3()

/** A raycaster that sees what the camera does not — the layer `instancing.ts` hides meshes on. */
export function withEveryLayer(raycaster: Raycaster): Raycaster {
  raycaster.layers.enableAll()
  return raycaster
}

/**
 * A pick that may widen the ray's tolerance, with both thresholds put back whatever it does.
 *
 * The raycaster is shared by every pick of the engine: a throw that left `Line.threshold` at
 * another value would silently take away the one thing a light is clickable BY, its helper's
 * lines, and nothing would go red.
 */
export function withHeldFuzz<T>(raycaster: Raycaster, pick: () => T): T {
  const { Line, Points } = raycaster.params
  const lines = Line.threshold
  const points = Points.threshold

  try {
    return pick()
  } finally {
    Line.threshold = lines
    Points.threshold = points
  }
}

/**
 * Whether a hit is scenery a DOCUMENT point may be written onto: not a rail of the studio, not a
 * workshop marker, and nothing hanging under something hidden.
 *
 * Walked up the ancestors rather than filtered at the roots, because `intersectObjects` recurses
 * and each of the three reappears through a parent that passed: a rail inside a group is reached
 * THROUGH the group — its knobs are 14 cm spheres, which no line threshold keeps out — a camera's
 * body and a lamp's bulb hang under nodes of their own, and three never reads `visible`.
 */
export function isScenery(object: Object3D, isRail: (nodeId: string) => boolean): boolean {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (!node.visible || node.name === MARKER_NAME || isRail(node.name)) return false
    // 🛑 The AIDS of a rail: a band IS scenery a point may be written onto, but its own line and
    // knobs hang under it and were taking the clicks meant for the surface.
    if (isRailAid(node.name)) return false
  }

  return true
}

/** How wide a rail's line is grabbed, as a share of the visible height: about six pixels. */
export const LINE_GRAB = 1 / 150

/** A control point, as the screen sees it. */
export type ProjectedKnob = Projected & PickedPathPoint

/** What the panel asks the engine to show in the corner — see `setCameraPreview`. */
export type CameraPreviewRequest = {
  cameraNodeId: string
  /** The inside of the DOM frame, in CSS pixels, measured rather than worked out. */
  rect: PaneRect
  /** Grown to the whole view. Told, never measured — the rect is two pixels short of it. */
  full: boolean
}

/**
 * How near the pointer must fall to grab a knob, in normalised device units — the knob covers
 * `KNOB_SHARE` of the height, which is 2 in this space, and a little over that is what a hand
 * needs. Far tighter than a bone's reach: knobs stand apart, where a rig's bones crowd.
 */
export const KNOB_REACH = 0.025

/** Where a normalised view stands when the camera already sits on its target and has no distance. */
export const DEFAULT_VIEW_DISTANCE = 8

/**
 * How far under zero the reference grid sits. Small enough to read as the ground plane, wide
 * enough that no depth buffer confuses the two.
 */
export const GRID_SINKAGE = 0.02

export { boundsOf } from './objectBounds'

/**
 * How far a side view stands off its target. Distance changes nothing an orthographic camera
 * shows — its frustum does that — but it decides what falls behind the near plane, and a camera
 * standing on the origin clips away the model it is aimed at.
 */
export const SIDE_VIEW_DISTANCE = 50

/** What a side view takes in when the scene is empty, and the floor under a tiny one. */
export const SIDE_VIEW_HEIGHT = 6

/** Room around what the side views frame, so nothing sits flush against the edge. */
export const SIDE_VIEW_MARGIN = 1.4

/**
 * A second of the trihedron's own animation, in the seconds it takes. It turns a whole revolution
 * per second and no side is half of one away, so one step lands on the target exactly.
 */
export const HELPER_SETTLES = 1

/**
 * Walks up to the object that stands for a node: the ray meets a helper's child, or one of the
 * hundred meshes a GLB brought — and `GLTFLoader` names every one of them, so a name alone
 * proves nothing. Only an id the engine put there counts, or a click on an imported model would
 * select something the scene has never heard of.
 */
export function nodeIdOf(object: Object3D, isNode: (name: string) => boolean): string | null {
  let current: Object3D | null = object
  while (current) {
    if (current.name && isNode(current.name)) return current.name
    current = current.parent
  }
  return null
}

/** Whether anything the drawn aids are built from moved — see `refreshAids`, which is not cheap. */
export function aidsMoved(held: ViewportOptions, next: ViewportOptions): boolean {
  return (
    held.boundingBoxes !== next.boundingBoxes ||
    held.origins !== next.origins ||
    held.normals !== next.normals ||
    held.normalLength !== next.normalLength
  )
}

/** The two that only turn existing helpers on and off, which costs a flag apiece. */
export function helperVisibilityMoved(held: ViewportOptions, next: ViewportOptions): boolean {
  return held.lightHelpers !== next.lightHelpers || held.cameraHelpers !== next.cameraHelpers
}

/**
 * Whether a model has to be built again rather than patched.
 *
 * A FILE that changed is not read here: it is not an edit of a document and cannot be seen in a
 * comparison of two states. `refreshModels` is the door for that, and it is imperative on purpose.
 */
export function pointsElsewhere(previous: ModelNode, node: SceneNode): boolean {
  if (node.type !== 'model') return true
  return previous.model.assetId !== node.model.assetId
}

export function disposeMaterial(mesh: Mesh): void {
  const { material } = mesh
  if (Array.isArray(material)) for (const entry of material) entry.dispose()
  else material.dispose()
}

/**
 * What each walking node FEELS, read off its controller. The physics reads the same two fields —
 * `characters.capsuleOf` — so what is drawn is what is felt, never a node's own geometry.
 */
export function capsuleBodiesOf(nodes: readonly SceneNode[]): ReadonlyMap<string, AidBody> {
  // Cached on the LIST, as `allPartsOf` is: `apply` runs on every selection and every frame of a
  // slider drag, and neither changes the identity of `nodes` — this was a third walk of it.
  return cachedOn(bodiesByNodes, nodes, () => walkCapsuleBodies(nodes))
}

export const bodiesByNodes = new WeakMap<readonly SceneNode[], ReadonlyMap<string, AidBody>>()

export function walkCapsuleBodies(nodes: readonly SceneNode[]): ReadonlyMap<string, AidBody> {
  const found = new Map<string, AidBody>()
  for (const node of nodes) {
    const walker = node.components?.find(one => one.type === 'CharacterController')
    if (!walker) continue

    // 🛑 Through `numberOf` and the runtime's OWN defaults, as `characters.capsuleOf` reads them:
    // a controller tuned to nothing is felt at 1,8 by the physics, and read raw it gave `NaN` —
    // so the one body a cage exists for was outlined by nothing at all.
    found.set(node.id, {
      height: numberOf(walker, 'height', WALKER.height),
      radius: numberOf(walker, 'radius', WALKER.radius),
    })
  }
  return found
}

/** The runtime's own defaults, so what is DRAWN is what is FELT — see `characters.capsuleOf`. */
export const WALKER = COMPONENT_DEFAULTS.CharacterController

// Rewritten in place: `facingOf` answers once per arm per apply.
export const FACING = new Euler()

export const FACED = new Quaternion()

/** Nothing drawn off a component — what a window that plays the scene is handed. */
export const NO_RIGS: AidRigs = { bodies: new Map(), arms: new Map() }

/**
 * Which of the three strategies draws the repeated shapes — the cells unless something says
 * otherwise. Naming a `grouping` is asking to leave them: the other two hold no zone at all.
 */
export function groupsFor(
  options: SceneRendererOptions,
): (host: Object3D, ownMaterialOf: (mesh: Mesh) => Material | Material[]) => InstancedGroups {
  if (options.optimization === 'off') return () => individualGroups()
  if (!options.grouping && options.partition !== 'off') return createOptimizedGroups
  if (options.partition === 'grid') return createCellGroups
  return options.grouping === 'batched' ? createBatchedGroups : createInstancedGroups
}

function individualGroups(): InstancedGroups {
  return {
    rebuild: () => 0,
    moved: () => false,
    drawn: () => [],
    pickable: () => [],
    editorPickable: () => [],
    editorSourceCount: () => 0,
    nodeIdOf: () => null,
    hangSources: () => {},
    dropSources: () => {},
    refreshSources: () => {},
    holdsSource: () => false,
    dispose: () => {},
  }
}
