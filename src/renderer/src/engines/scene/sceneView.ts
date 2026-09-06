import {
  Box3,
  EdgesGeometry,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  Vector3,
  WireframeGeometry,
  type Material,
  type Object3D,
} from 'three'
import { toRadians } from '@shared/domain/angles'
import {
  DISPLAY_MODES,
  VIEW_DIRECTIONS,
  type DisplayMode,
  type Transform,
  type Vector3 as PlainVector3,
  type ViewDirection,
} from '@shared/domain/scene'
import { centreOf, transformOf } from './pivot'

/**
 * What one view of a quad layout shows: a side, or a camera free to turn.
 *
 * `free` is the only one that orbits — an axis view exists precisely because it does NOT turn,
 * and a top view one drag away from being an almost-top view answers no question at all. Panning
 * and zooming stay: those move where one looks from, never the direction.
 */
/** A pane locked onto a camera of the scene: it draws what that camera films, and orbits IT. */
export type CameraView = { kind: 'camera'; nodeId: string }

export type PaneView = 'free' | ViewDirection | CameraView

/** The views that need nothing of the scene. A camera view names a node, so it is not one. */
export const PANE_VIEWS: readonly ('free' | ViewDirection)[] = ['free', ...VIEW_DIRECTIONS]

export function isCameraView(view: unknown): view is CameraView {
  if (typeof view !== 'object' || view === null) return false
  return 'kind' in view && view.kind === 'camera' && 'nodeId' in view
}

/**
 * What the four views open on: the one being flown, then the three sides a modelling package
 * shows around it. Every one of them can be changed afterwards — two perspectives and two sides
 * is a layout the user is entitled to.
 */
export const DEFAULT_PANE_VIEWS: readonly PaneView[] = ['free', 'top', 'front', 'left']

/** Unit vectors, in the studio's Y-up right-handed frame: front looks down −Z, from +Z. */
const AXES: Record<ViewDirection, [number, number, number]> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  top: [0, 1, 0],
  bottom: [0, -1, 0],
}

/**
 * Where the camera goes to look at `target` from a given side, keeping the distance it had.
 *
 * Straight up and straight down are nudged off the axis on purpose: orbit controls read the
 * camera's placement as spherical coordinates around the target, and a polar angle of exactly
 * zero has no azimuth — the very next drag would snap the view to an arbitrary side.
 */
export function viewPosition(
  direction: ViewDirection,
  target: Vector3,
  distance: number,
): { x: number; y: number; z: number } {
  const [x, y, z] = AXES[direction]
  const nudge = y === 0 ? 0 : distance * 0.0001

  return {
    x: target.x + x * distance,
    y: target.y + y * distance,
    z: target.z + z * distance + nudge,
  }
}

/** How square a direction has to be on an axis to count as that side. Cosine, so this is ~2.5°. */
const ALIGNED = 0.999

/**
 * The side a direction names, or `null` when it points between two — the inverse of `AXES`.
 *
 * What the trihedron's click is read through: the helper works out where it would send the
 * camera, and this turns that back into one of the six sides the studio already knows how to go
 * to, so the move itself goes through `viewFrom` rather than around it.
 */
export function directionOf(offset: Vector3): ViewDirection | null {
  const length = Math.hypot(offset.x, offset.y, offset.z)
  if (length === 0) return null

  return (
    VIEW_DIRECTIONS.find(direction => {
      const [x, y, z] = AXES[direction]
      return (offset.x * x + offset.y * y + offset.z * z) / length > ALIGNED
    }) ?? null
  )
}

/**
 * Which stand-in material a mode paints every surface with, or `none` for the real ones.
 *
 * A table rather than a chain of comparisons: the renderer asks it once per pass, and a mode
 * added without an answer here would silently draw as the real materials.
 */
export type Substitute = 'none' | 'solid' | 'matcap' | 'density' | 'hidden' | 'ghost'

const SUBSTITUTES: Record<DisplayMode, Substitute> = {
  shaded: 'none',
  wireframe: 'none',
  both: 'none',
  solid: 'solid',
  material: 'none',
  // The real materials, like `material` — what studio changes is what lights them, not what they
  // are. See `shownEnvironment` in the renderer.
  studio: 'none',
  matcap: 'matcap',
  density: 'density',
  ghost: 'ghost',
  // The same invisible material the quad wireframe hides its surfaces behind: what is left on
  // screen is the skeleton helper, which hangs beside the scene rather than inside it.
  skeleton: 'hidden',
}

export function substituteOf(mode: DisplayMode): Substitute {
  return SUBSTITUTES[mode]
}

/**
 * What a view draws when the edges are read as quads.
 *
 * `wireframe` normally rides on the material's own flag, which draws every triangle — diagonals
 * included, which is precisely what the quad reading removes. Asked for quads, the mode hides
 * its surfaces instead and lets the edge overlay be the whole picture.
 */
export function substituteFor(mode: DisplayMode, quads: boolean): Substitute {
  if (quads && mode === 'wireframe') return 'hidden'
  return substituteOf(mode)
}

/** Whether this view draws the edge overlay, which is where the quad reading lives. */
export function showsEdges(mode: DisplayMode, quads: boolean): boolean {
  return mode === 'both' || (quads && mode === 'wireframe')
}

/**
 * Whether the scene's own lights are put out for this view. The two modes that judge a surface
 * rather than a scene do it: what they exist for is to see a material under one known light.
 */
export function hidesSceneLights(mode: DisplayMode): boolean {
  return mode === 'material' || mode === 'studio'
}

/**
 * Whether this view drops the document's ENVIRONMENT too, and lights from three's own room.
 *
 * The one mode that still shows a mesh when the scene around it is a night sky with no lamp in
 * it. `material` deliberately keeps the document's sky: judging a material means judging it
 * under the light it will actually be seen in.
 */
export function hidesSceneEnvironment(mode: DisplayMode): boolean {
  return mode === 'studio'
}

/** The next mode in the list, wrapping — what one key does when three modes share it. */
export function nextDisplayMode(mode: DisplayMode): DisplayMode {
  const at = DISPLAY_MODES.indexOf(mode)
  return DISPLAY_MODES[(at + 1) % DISPLAY_MODES.length] ?? 'shaded'
}

/**
 * Wireframe on the materials themselves, never as a second pass over the scene: a pass would
 * redraw every triangle a second time, and this is a flag the shader already reads.
 *
 * `both` is the one mode a material cannot express — a wireframe material draws no surface — so
 * it is left to the overlay the renderer hangs under each mesh.
 */
export function applyDisplayMode(object: Object3D, mode: DisplayMode): void {
  object.traverse(child => {
    if (!(child instanceof Mesh)) return
    for (const material of materialsOf(child)) {
      // Structural: `Material` itself declares no `wireframe`, though every mesh material has one.
      if ('wireframe' in material) material.wireframe = mode === 'wireframe'
    }
  })
}

function materialsOf(mesh: Mesh): readonly Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}

/**
 * Names the edges the renderer hangs under a mesh, so removing them is a test rather than a map —
 * what marks an overlay as decoration rather than content.
 *
 * Exported because the exporter has to strip them and was naming them itself: a rename here would
 * have left wireframes baked into every delivered GLB, and nothing would have failed to compile.
 *
 * The NAME is shared, never the removal. This module owns the geometry and disposes it; the
 * exporter works on a `cloneSkinned` that shares the buffers, so disposing there would free
 * what the scene on screen is still drawing with.
 */
export const OVERLAY_NAME = 'wireframe-overlay'

/**
 * The layer the overlays hang on, so a camera decides for itself whether it draws them.
 *
 * Here rather than beside the renderer: whoever builds the edges is who has to place them, and
 * the two spellings drifting apart would show the edges in every view or in none.
 */
export const EDGE_LAYER = 1

/**
 * How far two faces may tilt apart and still count as one surface, in degrees.
 *
 * One degree, not the thirty a hard-edge pass would use: the diagonal of a quad is exactly
 * coplanar, so a tight threshold erases it and leaves everything a modeller would call an edge.
 */
const QUAD_ANGLE = 1

/**
 * The edges drawn over a shaded mesh, for the one mode a material cannot express.
 *
 * Built on demand and thrown away with the mode: a `WireframeGeometry` is its own buffer, and
 * keeping one alive per mesh of an imported model would cost the scene twice its geometry for a
 * mode nobody left on.
 */
export function applyWireOverlay(
  object: Object3D,
  on: boolean,
  material: Material,
  quads = false,
): void {
  // Collected first: `traverse` walks what it is given, and adding a child mid-walk would visit
  // the overlay just added, then the one added to it.
  const meshes: Mesh[] = []
  const overlays: Object3D[] = []
  object.traverse(child => {
    if (child.name === OVERLAY_NAME) overlays.push(child)
    else if (child instanceof Mesh) meshes.push(child)
  })

  for (const overlay of overlays) {
    if (overlay instanceof LineSegments) overlay.geometry.dispose()
    overlay.removeFromParent()
  }
  if (!on) return

  for (const mesh of meshes) {
    // `EdgesGeometry` drops the edge between two coplanar triangles, which is what makes a
    // triangulated quad read as a quad again. A GLB never carries real quads — the format stores
    // triangles and the exporter triangulated before the file was ever written — so this is a
    // reconstruction by angle, faithful except on strongly curved surfaces. Never call it truth.
    const geometry = quads
      ? new EdgesGeometry(mesh.geometry, QUAD_ANGLE)
      : new WireframeGeometry(mesh.geometry)
    const edges = new LineSegments(geometry, material)
    edges.name = OVERLAY_NAME
    edges.layers.set(EDGE_LAYER)
    // Decoration, and kept out of everything that reads the scene as content. The ray above all:
    // a line is met within a whole world unit of itself, so left pickable the overlay wraps every
    // edge in a halo that size, and a click into the void beside a cube would select the cube.
    edges.castShadow = false
    edges.receiveShadow = false
    edges.raycast = () => {}
    mesh.add(edges)
  }
}

/**
 * How far a camera has to stand for something that size to fill its view, plus a margin so the
 * edges are not flush against the frame.
 *
 * A constant step framed a studio primitive and stood *inside* a fifty-unit model. That went
 * unseen while an orthographic frustum ignored the move altogether — and became the whole of what
 * framing does the moment it stopped ignoring it.
 */
export function framingDistance(halfSize: number, fieldOfView: number): number {
  // The inverse of `frustumHeight`: the distance at which the visible height is twice this half.
  return (Math.max(halfSize, MIN_FRAMED_HALF) / Math.tan(toRadians(fieldOfView) / 2)) * FRAME_MARGIN
}

/** A point light and an empty group have no size at all, and would otherwise ask for distance nil. */
const MIN_FRAMED_HALF = 0.5

const FRAME_MARGIN = 1.2

/** Where to stand, and what to look at, so a selection fills the view. */
export type Framing = { target: Vector3; position: Vector3 }

/**
 * The same pair as plain numbers, for whoever has to store or hand it across — a store holds no
 * three.js object, and a placement read back into a fresh engine must survive the trip.
 */
export type CameraPlacement = {
  position: PlainVector3
  target: PlainVector3
  /** In degrees. Absent, the viewport keeps the lens its settings give it. */
  fieldOfView?: number
}

/**
 * One block watched on a clock of its own — which block, from where, and whether it runs.
 *
 * `at` is a position along the BLOCK in seconds, before speed and offset: the mixer reads it as
 * `at * speed + offset`. It is where a run STARTS and not where it stands — a position published
 * every frame would be the scene's clock again.
 */
export type PreviewWatch = {
  nodeId: string
  clipId: string
  at: number
  playing: boolean
}

/** Three's vector as the studio spells one everywhere else. */
export function plainVector({ x, y, z }: Vector3): PlainVector3 {
  return { x, y, z }
}

/**
 * The transform a node takes to stand where a view stands and look where it looks.
 *
 * Through a CAMERA and not a bare `Object3D`: `lookAt` branches on `isCamera` — it points local
 * +Z at the target for an object, and −Z for a camera. Aimed as an object, the camera would end
 * up in the right place facing exactly the opposite way.
 */
export function transformFromPlacement(placement: CameraPlacement, rest: Transform): Transform {
  const camera = new PerspectiveCamera()
  camera.position.set(placement.position.x, placement.position.y, placement.position.z)
  camera.lookAt(placement.target.x, placement.target.y, placement.target.z)

  // A camera is never scaled by this gesture: what it stood at is what it keeps.
  return { ...transformOf(camera), scale: rest.scale }
}

/**
 * The whole of what framing decides. Its own function because `frameSelection` needs mounted orbit
 * controls, which jsdom cannot give — leaving the decision inside it left it measured by nothing.
 */
export function framingPlacement(
  objects: readonly Object3D[],
  fieldOfView: number,
  from: Vector3 = FRAME_FROM,
): Framing {
  const bounds = new Box3()
  for (const object of objects) bounds.expandByObject(object)

  // A selection of lights and empty groups encloses no box at all, and their placements still
  // average to somewhere worth looking at.
  const empty = bounds.isEmpty()
  const target = empty ? centreOf(objects, new Vector3()) : bounds.getCenter(new Vector3())
  const size = empty ? new Vector3() : bounds.getSize(new Vector3())
  const distance = framingDistance(Math.max(size.x, size.y, size.z) / 2, fieldOfView)

  // The direction is the caller's, the DISTANCE is always this function's: that is what lets a
  // montage keep the angle somebody chose in the 3D tab while still filling the frame with the
  // subject. A working view is usually pulled well back — there is a grid to see around it —
  // and taken whole it hands the montage a character three pixels tall.
  const direction = from.lengthSq() > 0 ? from.clone().normalize() : FRAME_FROM

  return { target, position: target.clone().addScaledVector(direction, distance) }
}

/** Where framing stands from what it frames — the studio's three-quarter view, distance apart. */
const FRAME_FROM = new Vector3(4, 4, 4).normalize()
