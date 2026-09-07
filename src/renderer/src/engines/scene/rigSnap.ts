/**
 * A fitted skeleton pulled INSIDE the mesh it is meant to drive.
 *
 * `rigFit` reads a bounding box, and a box gives an envelope: it says how far the arms reach and
 * never at what height they run. Measured on screen — an arm that slopes down from the shoulder,
 * which is every A-pose there is, left the whole chain running through the air above it.
 *
 * The rule is one sentence: a joint sits at the CENTRE of the mesh's cross-section at its own
 * place along its limb. Arithmetic and nothing else, like the fit it corrects — no three objects,
 * no GPU — because this is where a skeleton is either inside a body or visibly beside it.
 */
import type { Rig, RigBone } from '@shared/domain/rig'
import type { Vector3 } from '@shared/domain/transform'
import { worldPlaces } from '../character/rigWorld'
import type { Bounds } from './rigFit'
import type { RigState } from './rigState'

/** What a mesh offers a fit: its envelope, and the points it is actually made of. */
export type MeshSample = {
  bounds: Bounds
  /** `x, y, z` per vertex, in the model's OWN space — the space the bones are hung in. */
  points: Float32Array
}

/** What a model just measured, or nothing where it carries bones and was never measured. */
export function meshSampleOf(rig: Pick<RigState, 'bounds' | 'points'>): MeshSample | null {
  return rig.bounds && rig.points ? { bounds: rig.bounds, points: rig.points } : null
}

type Axis = 'x' | 'y' | 'z'

const AXES: readonly Axis[] = ['x', 'y', 'z']

/**
 * How thick a slice is, as a fraction of height. Thin enough that an arm's slice holds only the
 * arm, thick enough that a slice of a hand still holds some hundreds of points.
 */
const SLICE = 0.035

/**
 * How far ACROSS the limb a point may sit and still be counted, as a fraction of height.
 *
 * 🛑 Not optional, and the reason is the shoulder: its slice runs through the whole trunk, so a
 * centroid taken from the slice alone dragged the joint down to the waist — measured on a real
 * character. A joint reads the mass AROUND it, never everything at its own depth.
 */
const REACH = 0.14

/**
 * How many times the joints are pulled.
 *
 * One pass moves a joint at most `REACH`, so a chain laid level across an arm that drops further
 * than that stops short of it — measured. Each pass starts where the last one landed, and a
 * centroid pulls towards mass, so it settles rather than swinging.
 */
const PASSES = 4

/**
 * How fine a joint's place is kept, as a fraction of height — a tenth of a millimetre on a metre.
 *
 * A centroid is a mean of thousands of vertices, so it lands on every digit a double can hold:
 * `0.14618632793426520` in a field that keeps them all, which no panel is wide enough to read.
 * Relative and not absolute, so a model authored in centimetres is kept as finely as the same
 * model in metres — the whole of what `rigFit` means by proportioning off the height.
 */
const GRAIN = 1e-4

/**
 * How many points a slice must hold before it is allowed to move a joint.
 *
 * A joint reading five vertices is a joint reading noise — a bolt, a strap, a stray triangle —
 * and moving it there is worse than leaving it where the proportions put it.
 */
const ENOUGH = 12

/**
 * Every joint of `rig` moved onto the mesh's own centre line, and the ones nothing could be
 * measured for left exactly where the fit put them.
 *
 * The two coordinates ACROSS the limb are what moves; the one ALONG it never does. Moving all
 * three would slide a wrist up the forearm and a knee into the thigh — the fit's proportions are
 * what says where along a limb a joint belongs, and the mesh is what says where the limb is.
 */
export function rigSnappedTo(rig: Rig, sample: MeshSample): Rig {
  const height = sample.bounds.max.y - sample.bounds.min.y
  const vertices = Math.floor(sample.points.length / 3)
  if (height <= 0 || vertices < ENOUGH) return rig

  const fitted = worldPlaces(rig.bones)
  const across = acrossOf(sample.bounds)
  const centre = (sample.bounds.min[across] + sample.bounds.max[across]) / 2
  const span = { slice: height * SLICE, reach: height * REACH }

  // The limb each joint runs along is read ONCE, off the proportions: a joint halfway to the mesh
  // has no chain of its own yet, and re-reading it per pass let one turn a corner.
  const along = new Map(rig.bones.map(bone => [bone.name, alongOf(bone, rig.bones, fitted)]))

  const world = new Map(fitted)
  for (let pass = 0; pass < PASSES; pass += 1) {
    for (const bone of rig.bones) {
      const here = world.get(bone.name)
      const axis = along.get(bone.name)
      if (!here || !axis) continue

      // A sided bone reads its OWN half of the body: a slice through both arms would centre every
      // joint on the midline, which is the one place an arm never is.
      const half =
        sideOf(bone) === null ? 0 : Math.sign((fitted.get(bone.name)?.[across] ?? 0) - centre)
      world.set(bone.name, centred(here, axis, sample, span, { across, centre, half }))
    }
  }

  const grain = height * GRAIN
  return { ...rig, bones: rig.bones.map(bone => rested(bone, world, fitted, grain)) }
}

/** Which horizontal axis the body runs across — the same reading the fit makes. */
function acrossOf(bounds: Bounds): Axis {
  return bounds.max.x - bounds.min.x >= bounds.max.z - bounds.min.z ? 'x' : 'z'
}

/** `Left`, `Right`, or none — a trunk bone reads both halves of the mesh. */
function sideOf(bone: RigBone): 'Left' | 'Right' | null {
  if (bone.name.startsWith('Left')) return 'Left'
  return bone.name.startsWith('Right') ? 'Right' : null
}

/**
 * Which axis this bone's own limb runs along: the dominant direction of the segment it makes with
 * its child, or with its parent where it has no child. A spine runs up, an arm out, a leg down.
 */
function alongOf(bone: RigBone, bones: readonly RigBone[], world: Map<string, Vector3>): Axis {
  const here = world.get(bone.name)
  // 🛑 The bone ARRIVING, and the one leaving only for a root that has none. A joint is the END
  // of its parent, and reading the bone that leaves it turns the corner of every chain that
  // turns one: the ankle took the FOOT's axis, so its slice ran the length of the foot and
  // centred it halfway along the sole — under the mesh, forward of the leg. Measured on screen.
  const child = bones.find(candidate => candidate.parent === bone.name)
  const other = world.get(bone.parent ?? child?.name ?? '')
  if (!here || !other) return 'y'

  const span = { x: other.x - here.x, y: other.y - here.y, z: other.z - here.z }
  return AXES.reduce(
    (best, axis) => (Math.abs(span[axis]) > Math.abs(span[best]) ? axis : best),
    'y',
  )
}

/**
 * One joint moved to the centre of the points sharing its place along the limb. Unchanged where
 * the slice holds too few to mean anything.
 */
function centred(
  here: Vector3,
  along: Axis,
  sample: MeshSample,
  span: { slice: number; reach: number },
  side: { across: Axis; centre: number; half: number },
): Vector3 {
  const sum = { x: 0, y: 0, z: 0 }
  let held = 0
  for (let vertex = 0; vertex < sample.points.length; vertex += 3) {
    const point = {
      x: sample.points[vertex] ?? 0,
      y: sample.points[vertex + 1] ?? 0,
      z: sample.points[vertex + 2] ?? 0,
    }
    if (Math.abs(point[along] - here[along]) > span.slice) continue
    if (side.half !== 0 && Math.sign(point[side.across] - side.centre) !== side.half) continue
    if (Math.hypot(point.x - here.x, point.y - here.y, point.z - here.z) > span.reach) continue
    sum.x += point.x
    sum.y += point.y
    sum.z += point.z
    held += 1
  }

  if (held < ENOUGH) return here
  return { x: sum.x / held, y: sum.y / held, z: sum.z / held, [along]: here[along] }
}

/** A bone rests in its PARENT's space, so the parent's new place is taken off before it is written. */
function rested(
  bone: RigBone,
  moved: Map<string, Vector3>,
  world: Map<string, Vector3>,
  grain: number,
): RigBone {
  const here = moved.get(bone.name) ?? world.get(bone.name)
  if (!here) return bone

  const parent =
    bone.parent === null ? null : (moved.get(bone.parent) ?? world.get(bone.parent) ?? null)
  const offset = parent
    ? { x: here.x - parent.x, y: here.y - parent.y, z: here.z - parent.z }
    : here

  return { ...bone, rest: { ...bone.rest, position: onGrain(offset, grain) } }
}

/** A place kept to the grain, so a field shows a number and not the whole of a double. */
function onGrain(point: Vector3, grain: number): Vector3 {
  if (grain <= 0) return point

  return {
    x: Math.round(point.x / grain) * grain,
    y: Math.round(point.y / grain) * grain,
    z: Math.round(point.z / grain) * grain,
  }
}
