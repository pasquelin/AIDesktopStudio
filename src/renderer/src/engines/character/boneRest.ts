/**
 * What the skeleton window lets a joint's rest become — the hold it offers, in one place.
 *
 * Both doors write the same rest: the gizmo on release, and the axis fields on a keystroke. A
 * hold spelled at each of them is a hold one of them walks through, which is a padlock that only
 * draws itself.
 *
 * Arithmetic and nothing else, so it can be held to account without a viewport.
 */
import type { Transform, Vector3 } from '@shared/domain/transform'

/** The three a joint can be held on. */
export type BoneAxis = 'x' | 'y' | 'z'

/**
 * `moved` brought back onto the axes it is held on, measured against where the joint `rested`.
 *
 * 🛑 No leash on the LENGTH, and that is an arbitration rather than an omission: posing turns the
 * bone arriving at a joint, so a length cannot change there, and editing a skeleton is where one
 * corrects a bone that is too long — holding it would forbid the very gesture the state is for.
 */
export function restWithin(
  rested: Transform,
  moved: Transform,
  heldAxes: readonly BoneAxis[],
): Transform {
  const kept = (was: Vector3, next: Vector3): Vector3 => ({
    x: heldAxes.includes('x') ? was.x : next.x,
    y: heldAxes.includes('y') ? was.y : next.y,
    z: heldAxes.includes('z') ? was.z : next.z,
  })

  return {
    position: kept(rested.position, moved.position),
    rotation: kept(rested.rotation, moved.rotation),
    scale: moved.scale,
  }
}
