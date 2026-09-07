/**
 * The working aids a viewport draws over a scene without being part of it: the box around an
 * object, its own axes at its pivot, and the normals of its surfaces.
 *
 * They hang BESIDE the nodes, like the grid, and never inside one — anything under a node would
 * be walked by the exporter, counted by the statistics and met by the ray. What they cost is
 * bounded on purpose: a `BoxHelper` per object of a large scene is affordable, a
 * `VertexNormalsHelper` per mesh of an imported model is not, which is why the normals are drawn
 * on the selection alone.
 */
import {
  AxesHelper,
  Box3,
  BoxHelper,
  CapsuleGeometry,
  CylinderGeometry,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Color,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  Vector3,
  WireframeGeometry,
  type BufferGeometry,
  type Object3D,
} from 'three'
import type { ArmRig } from './springArmRigs'
import { CAMERA_LENS_REACH } from './threeFactory'
import { VertexNormalsHelper } from 'three/addons/helpers/VertexNormalsHelper.js'
import { showsAid, type HelperVisibility } from '@shared/domain/scene'
import { sameVector3 } from '@shared/domain/transform'

export type AidPalette = {
  /** What a bounding box is drawn in. */
  box: string
  origin: string
  normal: string
  /** The cage a walking body is outlined with. */
  body: string
  /** The arm a camera hangs on — the one aid painted a colour of its own. */
  arm: string
}

/** The capsule a `CharacterController` FEELS, as the physics reads it — never a node's geometry. */
export type AidBody = { height: number; radius: number }

/**
 * What is drawn off the COMPONENTS rather than off a geometry — the two volumes no shape carries.
 * Keyed by node: a body by the one that walks, an arm by the one that carries the arm.
 */
export type AidRigs = {
  bodies: ReadonlyMap<string, AidBody>
  arms: ReadonlyMap<string, ArmRig>
}

export type AidSettings = {
  boundingBoxes: HelperVisibility
  origins: boolean
  normals: boolean
  normalLength: number
}

type CageMap = Map<string, { line: LineSegments; body: AidBody; object: Object3D }>
type ArmMap = Map<string, { line: Mesh; rig: ArmRig; object: Object3D }>

function dropAid<T extends Object3D & { dispose: () => void }>(held: Map<string, T>, id: string) {
  const helper = held.get(id)
  if (!helper) return
  helper.removeFromParent()
  helper.dispose()
  held.delete(id)
}

function dropAllAids<T extends Object3D & { dispose: () => void }>(held: Map<string, T>) {
  for (const id of [...held.keys()]) dropAid(held, id)
}

export type ViewportAids = {
  /**
   * The one group they all hang from, so a render pass hides the lot with a single flag — a film
   * is the scene, never the tools it was built with. See `hideWorkshop`.
   */
  object: Object3D
  /** Whether nothing at all is drawn, so a caller on a hot path can skip `apply` outright. */
  idle: () => boolean
  /**
   * Rebuilds what should be drawn from what is on stage. Safe to call on every apply: a helper
   * whose object has not moved is left exactly where it is.
   */
  apply: (
    objects: ReadonlyMap<string, Object3D>,
    selectedIds: readonly string[],
    settings: AidSettings,
    palette: AidPalette,
    /** Always drawn: a volume one cannot see is one nobody tunes — the same bargain every engine
     * makes with its collision shapes. */
    rigs: AidRigs,
  ) => void
  /** The boxes follow what moved. Cheap — a `BoxHelper` re-reads a bounding box, nothing else. */
  refreshBoxes: () => void
  dispose: () => void
}

/** How far an object's own axes reach, relative to the box around it. */
const ORIGIN_SCALE = 0.35

/** So a lone empty group still shows something to grab hold of. */
const MIN_ORIGIN = 0.25

export function createViewportAids(): ViewportAids {
  const host = new Group()
  const boxes = new Map<string, BoxHelper>()
  const origins = new Map<string, AxesHelper>()
  /** Keyed by node, though a node may be a whole model: see `normalsFor`, which picks one mesh. */
  const normals = new Map<string, VertexNormalsHelper>()
  /** Keyed by node, and rebuilt only when the FIGURES change — see the sweep in `apply`. */
  const cages: CageMap = new Map()
  /** The same bargain for the arms, whose shape is rebuilt only when the arm itself is retuned. */
  const armsDrawn: ArmMap = new Map()

  return {
    object: host,

    idle: () =>
      boxes.size === 0 &&
      origins.size === 0 &&
      normals.size === 0 &&
      cages.size === 0 &&
      armsDrawn.size === 0,

    apply: (objects, selectedIds, settings, palette, rigs) => {
      syncRigAids(host, cages, armsDrawn, objects, palette, rigs)

      const selected = new Set(selectedIds)
      syncBoxes(host, boxes, objects, selected, settings.boundingBoxes, palette.box)

      syncOrigins(host, origins, objects, settings.origins)

      // KEPT rather than rebuilt. The geometry is two vertices per normal of the mesh — 2,4 Mo
      // on a 100 000-vertex model — and `apply` runs on every state change, selection included:
      // dropping and rebuilding here re-uploaded that on each frame of any slider drag.
      for (const [id, helper] of [...normals]) {
        const shown = settings.normals && selected.has(id) && (objects.get(id)?.visible ?? false)
        if (!shown || helper.object !== meshOf(objects.get(id))) dropAid(normals, id)
        else if (helper.size !== settings.normalLength) dropAid(normals, id)
      }
      if (settings.normals) {
        for (const id of selected) {
          const object = objects.get(id)
          if (normals.has(id) || !object?.visible) continue
          const helper = normalsFor(object, settings.normalLength, palette.normal)
          if (!helper) continue
          normals.set(id, helper)
          host.add(helper)
        }
      }

      refreshDrawnAids(origins, boxes, normals, objects)
    },

    // The boxes ALONE, and that is the point: `BoxHelper.update` re-reads a bounding box, while
    // `VertexNormalsHelper.update` walks every vertex and re-uploads its buffer. One belongs on
    // every frame of a drag; the other does not.
    refreshBoxes: () => {
      poseCages(cages)
      poseArms(armsDrawn)

      for (const helper of boxes.values()) helper.update()
    },

    dispose: () => {
      for (const id of [...cages.keys()]) dropLine(cages, id)
      for (const id of [...armsDrawn.keys()]) dropLine(armsDrawn, id)

      host.removeFromParent()
      dropAllAids(boxes)
      dropAllAids(origins)
      dropAllAids(normals)
    },
  }
}

function syncRigAids(
  host: Object3D,
  cages: CageMap,
  armsDrawn: ArmMap,
  objects: ReadonlyMap<string, Object3D>,
  palette: AidPalette,
  rigs: AidRigs,
): void {
  for (const [id, held] of [...cages]) {
    const wanted = rigs.bodies.get(id)
    const same = wanted && wanted.height === held.body.height && wanted.radius === held.body.radius
    if (!same || objects.get(id) !== held.object) dropLine(cages, id)
  }
  for (const [id, body] of rigs.bodies) {
    const object = objects.get(id)
    if (cages.has(id) || !object) continue
    const line = capsuleCage(body, palette.body)
    cages.set(id, { line, body, object })
    host.add(line)
  }
  syncArmAids(host, armsDrawn, objects, palette.arm, rigs.arms)
  poseCages(cages)
  poseArms(armsDrawn)
}

function syncBoxes(
  host: Object3D,
  boxes: Map<string, BoxHelper>,
  objects: ReadonlyMap<string, Object3D>,
  selected: ReadonlySet<string>,
  visibility: HelperVisibility,
  colour: string,
): void {
  const wanted = (id: string): boolean =>
    showsAid(visibility, selected, id) && (objects.get(id)?.visible ?? false)
  for (const [id, helper] of [...boxes]) {
    if (helper.object !== objects.get(id) || !wanted(id)) dropAid(boxes, id)
  }
  for (const [id, object] of objects) {
    if (!wanted(id) || boxes.has(id)) continue
    const helper = new BoxHelper(standing(object), new Color(colour))
    helper.raycast = () => {}
    boxes.set(id, helper)
    host.add(helper)
  }
}

function syncOrigins(
  host: Object3D,
  origins: Map<string, AxesHelper>,
  objects: ReadonlyMap<string, Object3D>,
  shown: boolean,
): void {
  for (const id of [...origins.keys()]) {
    if (!shown || !objects.get(id)?.visible) dropAid(origins, id)
  }
  if (!shown) return
  for (const [id, object] of objects) {
    if (origins.has(id) || !object.visible) continue
    const helper = new AxesHelper(originSize(standing(object)))
    helper.raycast = () => {}
    origins.set(id, helper)
    host.add(helper)
  }
}

function refreshDrawnAids(
  origins: ReadonlyMap<string, AxesHelper>,
  boxes: ReadonlyMap<string, BoxHelper>,
  normals: ReadonlyMap<string, VertexNormalsHelper>,
  objects: ReadonlyMap<string, Object3D>,
): void {
  for (const [id, helper] of origins) {
    const object = objects.get(id)
    if (object) helper.position.setFromMatrixPosition(standing(object).matrixWorld)
  }
  for (const helper of boxes.values()) refreshBox(helper)
  for (const helper of normals.values()) helper.update()
}

function syncArmAids(
  host: Object3D,
  drawn: ArmMap,
  objects: ReadonlyMap<string, Object3D>,
  colour: string,
  arms: ReadonlyMap<string, ArmRig>,
): void {
  for (const [id, held] of [...drawn]) {
    const wanted = arms.get(id)
    if (!wanted || !sameArm(wanted, held.rig) || objects.get(held.rig.subjectId) !== held.object) {
      dropLine(drawn, id)
    }
  }
  for (const [id, rig] of arms) {
    const object = objects.get(rig.subjectId)
    if (drawn.has(id) || !object) continue
    const line = armLine(rig, colour)
    drawn.set(id, { line, rig, object })
    host.add(line)
  }
}

/**
 * The normals of the first mesh found under a node, or nothing.
 *
 * `VertexNormalsHelper` reads `geometry.attributes.normal.count` in its constructor and throws
 * without one — and a generated model routinely arrives with a mesh that has no normals at all.
 * The check is what keeps a toggle from taking the viewport down on somebody's asset.
 *
 * One mesh and not all of them: a helper per mesh of an imported tree is thousands of line
 * segments, and what this answers — « which way is this surface facing » — is answered by one.
 */
function normalsFor(object: Object3D, size: number, color: string): VertexNormalsHelper | null {
  const found = meshOf(object)
  if (!found) return null

  const helper = new VertexNormalsHelper(found, size, new Color(color).getHex())
  helper.raycast = () => {}
  return helper
}

/**
 * The first mesh under a node that carries normals, or nothing.
 *
 * Walked with an explicit stack rather than `traverse`, which visits a whole imported tree even
 * once the answer is in hand — thousands of nodes for a question one of them settles.
 */
function meshOf(object: Object3D | undefined): Mesh | null {
  const stack: Object3D[] = object ? [object] : []

  while (stack.length > 0) {
    const child = stack.pop()
    if (!child) break
    if (child instanceof Mesh && child.geometry.getAttribute('normal')) return child
    stack.push(...child.children)
  }
  return null
}

/** Axes proportional to what they stand at the centre of, so a cube and a car both read. */
function originSize(object: Object3D): number {
  const size = new Box3().setFromObject(object).getSize(new Vector3())
  return Math.max(MIN_ORIGIN, Math.max(size.x, size.y, size.z) * ORIGIN_SCALE)
}

/** The cage a walking body wears — sparse on purpose, so it reads as a volume and not as a solid. */
function capsuleCage(body: AidBody, colour: string): LineSegments {
  const cylinder = Math.max(0, body.height - 2 * body.radius)
  return aidLine(new WireframeGeometry(new CapsuleGeometry(body.radius, cylinder, 4, 8)), colour)
}

/**
 * 🛑 `matrixWorld` written DIRECTLY, both updates off: an aid hangs from the workshop group rather
 * than from the node, so three would recompose its place from a local `matrix` — which drew it
 * metres away from what it outlines. `poseCages` and `poseArms` are the other half.
 */
function aidLine(geometry: BufferGeometry, colour: string): LineSegments {
  return asAid(
    new LineSegments(
      geometry,
      new LineBasicMaterial({ color: new Color(colour), depthTest: false }),
    ),
  )
}

/** Decoration: never picked, never in a shadow map, and placed by a written world matrix. */
function asAid<T extends Object3D>(drawn: T): T {
  drawn.matrixAutoUpdate = false
  drawn.matrixWorldAutoUpdate = false
  drawn.raycast = () => {}
  drawn.renderOrder = 1
  return drawn
}

/**
 * 🛑 Where an object actually STANDS, never where its last frame left it. The renderer writes the
 * LOCAL transforms and draws the aids straight after, while three recomposes `matrixWorld` at the
 * draw — measured: a mesh 40 m out under a moved parent was boxed at the origin.
 *
 * Its OWN chain and nothing else, as `railCamera` does: `scene.updateMatrixWorld(true)` would
 * recompose every object of the scene, bones included, on every apply.
 */
function standing(object: Object3D): Object3D {
  object.updateWorldMatrix(true, false)
  return object
}

/** A box re-reads its object's bounds, which are only true once the chain above it is composed. */
function refreshBox(helper: BoxHelper): void {
  standing(helper.object)
  helper.update()
}

function poseCages(held: Map<string, { line: LineSegments; object: Object3D }>): void {
  for (const cage of held.values()) cage.line.matrixWorld.copy(standing(cage.object).matrixWorld)
}

/** An arm starts AT the body it watches — its far end is where the camera sits. */
function poseArms(held: Map<string, { line: Mesh; object: Object3D }>): void {
  for (const arm of held.values()) {
    STANDING.setFromMatrixPosition(standing(arm.object).matrixWorld)
    arm.line.matrixWorld.makeTranslation(STANDING.x, STANDING.y, STANDING.z)
  }
}

/**
 * 🛑 A SOLID and not a line: `linewidth` is ignored by WebGL, so a `LineSegments` arm was one
 * pixel wide whatever was asked — the thing nobody could see. Nothing marks its far end, where
 * the camera's own body already stands.
 *
 * Reach BAKED into the geometry, so placing it stays the translation `poseArms` writes.
 */
function armLine(rig: ArmRig, colour: string): Mesh {
  REACH.set(rig.lift.x + rig.back.x, rig.lift.y + rig.back.y, rig.lift.z + rig.back.z)
  const full = REACH.length()
  // Stops at the LENS, never at the camera's own point: the beam leaves where the shot does.
  const length = Math.max(0, full - CAMERA_LENS_REACH)
  const geometry = new CylinderGeometry(ARM_THICKNESS, ARM_THICKNESS, length, 6)
  if (full > 0) {
    // A cylinder is born standing up its own Y: laid along the reach, then pushed to its middle.
    REACH.normalize()
    geometry.applyMatrix4(
      TURN.makeRotationFromQuaternion(ARM_TURN.setFromUnitVectors(UPRIGHT, REACH)),
    )
    geometry.translate((REACH.x * length) / 2, (REACH.y * length) / 2, (REACH.z * length) / 2)
  }

  return asAid(
    new Mesh(
      geometry,
      // Barely see-through, which is what reads as a beam rather than as a rod.
      new MeshBasicMaterial({
        color: new Color(colour),
        depthTest: false,
        transparent: true,
        opacity: BEAM_OPACITY,
      }),
    ),
  )
}

/** Thick enough to read across a set, thin enough not to hide the body it points at. */
const ARM_THICKNESS = 0.022
const BEAM_OPACITY = 0.82

const REACH = new Vector3()
const TURN = new Matrix4()
const ARM_TURN = new Quaternion()
const UPRIGHT = new Vector3(0, 1, 0)

/** Retuning the arm is what rebuilds its shape; moving the body is not. */
function sameArm(wanted: ArmRig, held: ArmRig): boolean {
  return (
    wanted.subjectId === held.subjectId &&
    sameVector3(wanted.lift, held.lift) &&
    sameVector3(wanted.back, held.back)
  )
}

function dropLine(held: Map<string, { line: Mesh | LineSegments }>, id: string): void {
  const drawn = held.get(id)
  if (!drawn) return
  drawn.line.removeFromParent()
  drawn.line.geometry.dispose()
  const material = drawn.line.material
  if (!Array.isArray(material)) material.dispose()
  held.delete(id)
}

// Rewritten in place: `poseArms` runs on every apply and on every frame of a drag.
const STANDING = new Vector3()
