import type { RigBone } from '@shared/domain/rig'
import type { Vector3 } from '@shared/domain/transform'

export const ORIGIN: Vector3 = { x: 0, y: 0, z: 0 }

/** Rest poses are written in a parent's space; the distances are measured in the mesh's. */
export function worldPlaces(bones: readonly RigBone[]): Map<string, Vector3> {
  const byName = new Map(bones.map(bone => [bone.name, bone]))
  const world = new Map<string, Vector3>()

  const place = (bone: RigBone): Vector3 => {
    const known = world.get(bone.name)
    if (known) return known

    const parent = bone.parent === null ? null : byName.get(bone.parent)
    const above = parent && parent !== bone ? place(parent) : ORIGIN
    const here = {
      x: above.x + bone.rest.position.x,
      y: above.y + bone.rest.position.y,
      z: above.z + bone.rest.position.z,
    }
    world.set(bone.name, here)
    return here
  }

  for (const bone of bones) place(bone)
  return world
}
