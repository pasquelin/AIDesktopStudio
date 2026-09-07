import { Matrix4 } from 'three'
import type { Transform, Vector3 } from '@shared/domain/transform'
import { matrixOfTransform, transformOfMatrix } from '@/engines/csg/csgMatrix'
import type { SceneNode } from '@/engines/scene/sceneState'

/**
 * Where a node stands in the WORLD, and how to write a world pose back into its own frame.
 *
 * 🛑 Nothing is CACHED: a parent moves during a game, and a matrix remembered at build made a
 * child's mesh fall twice as fast as its collider. 0,23 µs a call, 0,05 ms at 200 bodies.
 * 🛑 A parent scaled UNEVENLY shears, and `decompose` cannot describe shear — the rotation this
 * hands back is then wrong. The reserve `csgMatrix` already writes, and ADR-25.
 */
export type Hierarchy = {
  /** The node's place with every parent composed in. Its own transform when the scene lost it. */
  worldOf: (nodeId: string, own: Transform) => Transform
  /**
   * A world pose written back into the node's own frame, or `null` when the node has no parent
   * and the two are the same thing — which spares an entity per body per step.
   *
   * The inverse of the PARENT's matrix, never of the node's own: what the physics moved is the
   * body, and what the document holds is where it sits inside whatever it hangs from.
   */
  localOf: (nodeId: string, position: Vector3, rotation: Vector3) => Transform | null
}

/**
 * 🛑 `liveOf` is REQUIRED, and it is the whole of what makes a moving parent carry: `byId` holds
 * the DOCUMENT's nodes and an entity holds a copy, so composing from the node alone framed every
 * child at the place its parent stood when Play began. Measured — a rider on a lift stayed at 1
 * while the lift reached 6. A caller with nothing live to offer answers `null`.
 */
export function createHierarchy(
  byId: ReadonlyMap<string, SceneNode>,
  liveOf: (nodeId: string) => Transform | null,
): Hierarchy {
  /** The chain above a node, composed. Identity for one that hangs from nothing the scene holds. */
  const above = (parentId: string | null): Matrix4 => {
    const world = new Matrix4()
    // No visited set, as `carve.ts` walks this same chain without one: `canReparent` refuses a
    // circular parent, and a cycle would be a document no gesture of the studio can write.
    let walker = parentId === null ? undefined : byId.get(parentId)
    while (walker) {
      world.premultiply(matrixOfTransform(liveOf(walker.id) ?? walker.transform))
      walker = walker.parentId === null ? undefined : byId.get(walker.parentId)
    }
    return world
  }

  const parentOf = (nodeId: string): string | null => byId.get(nodeId)?.parentId ?? null

  return {
    worldOf: (nodeId, own) => {
      const parentId = parentOf(nodeId)
      if (parentId === null) return own

      return transformOfMatrix(above(parentId).multiply(matrixOfTransform(own)))
    },

    localOf: (nodeId, position, rotation) => {
      const parentId = parentOf(nodeId)
      if (parentId === null) return null

      const held = byId.get(nodeId)?.transform.scale ?? { x: 1, y: 1, z: 1 }
      const world = matrixOfTransform({ position, rotation, scale: held })
      return transformOfMatrix(above(parentId).invert().multiply(world))
    },
  }
}
