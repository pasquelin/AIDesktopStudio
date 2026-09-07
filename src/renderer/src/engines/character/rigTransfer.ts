import type { Bounds } from '../scene/rigFit'
import { rigFaultOf, type Rig, type RigBone } from '@shared/domain/rig'
import type { Vector3 } from '@shared/domain/transform'
import { ORIGIN, worldPlaces } from './rigWorld'

/** Why a skeleton cannot be taken from one body to another, or nothing. */
export type RigTransferFault = 'empty' | 'no-height'

export function rigTransferFaultOf(
  rig: Rig | null,
  from: Bounds,
  to: Bounds,
): RigTransferFault | null {
  if (!rig || rig.bones.length === 0) return 'empty'

  return heightOf(from) > 0 && heightOf(to) > 0 ? null : 'no-height'
}

/**
 * The same skeleton on another body: an INDEPENDENT copy, scaled to the receiver and stood on
 * its feet.
 *
 * 🛑 Never a link. Each model owns its skeleton whole — a third arm, a tail, a child beside an
 * adult — and a shared one would make every one of those impossible.
 *
 * Uniform, and that is a decision: a remap per axis would spread the arms of a wider body
 * without lengthening the humerus, and put its elbows outside the mesh. What it keeps are the
 * DONOR's proportions, at the receiver's size — the bone editor is what corrects that, and it
 * is already better than `rigFit`, which knows nothing of either body's shape.
 */
export function rigTransferred(rig: Rig, from: Bounds, to: Bounds): Rig | null {
  if (rigTransferFaultOf(rig, from, to)) return null

  const scale = heightOf(to) / heightOf(from)
  const world = worldPlaces(rig.bones)
  const placed = new Map<string, Vector3>()

  for (const bone of rig.bones) {
    const at = world.get(bone.name)
    if (!at) continue

    placed.set(bone.name, {
      x: (at.x - centreX(from)) * scale + centreX(to),
      // Feet on the receiver's own floor: a skeleton standing where the donor's did would sink
      // into a shorter body and float over a taller one.
      y: (at.y - from.min.y) * scale + to.min.y,
      z: (at.z - centreZ(from)) * scale + centreZ(to),
    })
  }

  const bones = rig.bones.map(bone => ({
    ...bone,
    rest: {
      ...bone.rest,
      position: localOf(placed, bone),
    },
  }))

  // A copy that would not hold is no copy at all: the reader drops such a rig on the next open.
  return rigFaultOf(bones) === null ? { bones, origin: 'imported' } : null
}

/** Rest poses are written in a parent's space; the placing above is done in the body's. */
function localOf(placed: ReadonlyMap<string, Vector3>, bone: RigBone): Vector3 {
  const here = placed.get(bone.name) ?? ORIGIN
  const above = bone.parent === null ? ORIGIN : (placed.get(bone.parent) ?? ORIGIN)

  return { x: here.x - above.x, y: here.y - above.y, z: here.z - above.z }
}

const heightOf = (bounds: Bounds): number => bounds.max.y - bounds.min.y
const centreX = (bounds: Bounds): number => (bounds.min.x + bounds.max.x) / 2
const centreZ = (bounds: Bounds): number => (bounds.min.z + bounds.max.z) / 2
