/**
 * The bones of a skeleton drawn as SOLIDS, the way every 3D editor draws them.
 *
 * A line between two joints says where a bone runs and nothing about which way it faces, so a
 * rotation had no landmark at all: the gizmo turned and the skeleton looked identical. An
 * octahedron — wide near its head, tapering to its tail — reads as a direction at a glance, and
 * its four faces catch the light differently as it turns.
 *
 * Rebuilt into ONE geometry rather than a mesh per bone: fifty-two meshes are fifty-two draw
 * calls and fifty-two matrices to update every frame the pose moves.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  type Bone,
  type Object3D,
} from 'three'
import { rootColour } from '../core/palette'
import { boneLinksOf, type BoneLink } from './boneLinks'

/** Triangles per link: four from the head to the waist, four from the waist to the tail. */
const FACES = 8

/** How far along the bone its widest ring sits, and how wide that ring is, as fractions. */
const WAIST_ALONG = 0.12
const WAIST_WIDE = 0.1
/**
 * No bone thinner than this fraction of the skeleton's median bone: sized to itself alone, the
 * 2 cm collar bone was a 2 mm hair between two solids — measured on screen.
 */
const WAIST_FLOOR = 0.05

/**
 * What a bone with no child is drawn as, as a fraction of its parent's length.
 *
 * SHORT, and that is the whole of the choice: a rig here has no tail of its own, so a leaf's
 * length is invented — and an invented length that runs past the mesh draws bone where there is
 * none. Measured on a toe: at a third of the foot it speared out through the front of the shoe.
 * A stub says « the chain ends here » without claiming to fill anything.
 */
const LEAF = 0.12

/** The two colours a bone takes. Handed in for `createBoneJoints`' reason: a runner resolves none. */
export type BoneColours = { rest: string; picked: string }

const BONE_COLOURS = (): BoneColours => ({
  rest: rootColour('--color-mesh'),
  picked: rootColour('--color-accent'),
})

/** What the mesh is named, which is how a suite finds the bones beside a node. */
export const BONE_SHAPES = 'BoneShapes'

export type BoneShapes = {
  mesh: Mesh
  /** The stretches drawn, one solid each — what a click over the skeleton is measured against. */
  links: readonly BoneLink<Bone>[]
  /** Reads every bone's world placement again — they move with the pose, every frame. */
  refresh: () => void
  /** Paints one bone as the CHOSEN one, or none. */
  pick: (bone: string | null) => void
  dispose: () => void
}

const HEAD = new Vector3()
const TAIL = new Vector3()
const AXIS = new Vector3()
const SIDE = new Vector3()
const UP = new Vector3()
const RING = new Vector3()

/**
 * One octahedron per LINK — a bone towards each of its children — in WORLD space and hung beside
 * the scene rather than inside it.
 *
 * Inside, the outliner would list it and a click could pick it; beside, it is decoration exactly
 * as the helper it replaces was.
 */
export function createBoneShapes(
  bones: readonly Bone[],
  readColours: () => BoneColours = BONE_COLOURS,
): BoneShapes {
  const links = boneLinksOf(bones)
  const vertices = links.length * FACES * 3
  const positions = new Float32Array(vertices * 3)
  const colours = new Float32Array(vertices * 3)

  const geometry = new BufferGeometry()
  const position = new BufferAttribute(positions, 3)
  const colour = new BufferAttribute(colours, 3)
  geometry.setAttribute('position', position)
  geometry.setAttribute('color', colour)

  const palette = readColours()
  const restColour = new Color(palette.rest)
  const pickedColour = new Color(palette.picked)

  const material = new MeshBasicMaterial({
    vertexColors: true,
    depthTest: false,
    transparent: true,
    opacity: 0.9,
  })

  const mesh = new Mesh(geometry, material)
  mesh.name = BONE_SHAPES
  mesh.raycast = () => {}
  mesh.renderOrder = 1
  mesh.frustumCulled = false

  const held = new Set<Object3D>(bones)
  const roots = bones.filter(bone => !bone.parent || !held.has(bone.parent))
  for (const root of roots) root.updateWorldMatrix(true, true)
  const floor = medianLength(links) * WAIST_FLOOR

  const refresh = (): void => {
    for (const root of roots) root.updateWorldMatrix(true, true)

    for (const [index, { bone, child }] of links.entries()) {
      HEAD.setFromMatrixPosition(bone.matrixWorld)
      if (child) TAIL.setFromMatrixPosition(child.matrixWorld)
      else leafTail(bone, HEAD, TAIL)

      writeOctahedron(positions, index * FACES * 9, HEAD, TAIL, waistOf(child, floor))
    }
    position.needsUpdate = true
  }

  // Every link of the chosen bone: the hips picked are the hips towards the spine AND both legs.
  const pick = (picked: string | null): void => {
    for (const [index, { bone }] of links.entries()) {
      const paint = bone.name === picked ? pickedColour : restColour
      for (let corner = 0; corner < FACES * 3; corner += 1) {
        const at = (index * FACES * 3 + corner) * 3
        colours[at] = paint.r
        colours[at + 1] = paint.g
        colours[at + 2] = paint.b
      }
    }
    colour.needsUpdate = true
  }

  refresh()
  pick(null)

  return {
    mesh,
    links,
    refresh,
    pick,
    dispose: () => {
      geometry.dispose()
      material.dispose()
    },
  }
}

/** The waist of the link just laid in `HEAD`/`TAIL`: a stub is as wide as the bone it ends. */
function waistOf(child: Bone | null, floor: number): number {
  const own = child ? HEAD.distanceTo(TAIL) : HEAD.distanceTo(TAIL) / LEAF
  return Math.max(own * WAIST_WIDE, floor)
}

/** The typical bone of this skeleton, stubs left out: they are invented, not measured. */
function medianLength(links: readonly BoneLink<Bone>[]): number {
  const lengths = links
    .filter(link => link.child !== null)
    .map(({ bone, child }) =>
      HEAD.setFromMatrixPosition(bone.matrixWorld).distanceTo(
        TAIL.setFromMatrixPosition((child ?? bone).matrixWorld),
      ),
    )
    .sort((one, two) => one - two)
  const middle = Math.floor(lengths.length / 2)
  if (lengths.length === 0) return 0
  return lengths.length % 2 === 1
    ? (lengths[middle] ?? 0)
    : ((lengths[middle - 1] ?? 0) + (lengths[middle] ?? 0)) / 2
}

/**
 * Where a bone with no child points, and how far.
 *
 * Along its PARENT's direction: a leaf carries no direction of its own, and drawing it along an
 * arbitrary axis would make a fingertip point somewhere its finger does not.
 */
export function leafTail(bone: Bone, head: Vector3, into: Vector3): void {
  const parent = bone.parent
  if (!parent) {
    into.copy(head).addScaledVector(new Vector3(0, 1, 0), LEAF)
    return
  }

  AXIS.setFromMatrixPosition(parent.matrixWorld)
  into.copy(head).sub(AXIS)
  const length = into.length()
  if (length <= 0) into.set(0, LEAF, 0)
  else into.multiplyScalar(LEAF)
  into.add(head)
}

/**
 * Eight triangles: head to waist ring, waist ring to tail. The ring is square and perpendicular
 * to the bone, which is what makes a turn about the bone's own axis visible.
 */
function writeOctahedron(
  into: Float32Array,
  at: number,
  head: Vector3,
  tail: Vector3,
  waist: number,
): void {
  AXIS.copy(tail).sub(head)
  const length = AXIS.length()
  if (length <= 0) {
    into.fill(0, at, at + FACES * 9)
    return
  }
  AXIS.divideScalar(length)
  UP.set(0, 1, 0)
  if (Math.abs(AXIS.y) > 0.9) UP.set(1, 0, 0)
  SIDE.copy(UP).cross(AXIS).normalize()
  UP.copy(AXIS).cross(SIDE).normalize()
  const ring: Vector3[] = []
  for (const [side, up] of [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ]) {
    ring.push(
      RING.copy(head)
        .addScaledVector(AXIS, length * WAIST_ALONG)
        .addScaledVector(SIDE, (side ?? 0) * waist)
        .addScaledVector(UP, (up ?? 0) * waist)
        .clone(),
    )
  }
  let cursor = at
  const write = (point: Vector3): void => {
    into[cursor] = point.x
    into[cursor + 1] = point.y
    into[cursor + 2] = point.z
    cursor += 3
  }
  for (let corner = 0; corner < 4; corner += 1) {
    const one = ring[corner]
    const next = ring[(corner + 1) % 4]
    if (!one || !next) continue

    write(head)
    write(one)
    write(next)

    write(tail)
    write(next)
    write(one)
  }
}
