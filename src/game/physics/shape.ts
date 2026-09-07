// SPDX-License-Identifier: MIT

import type { Vector3 } from '@shared/domain/transform'

/**
 * What the physics feels of one body. Not a component — a component is pure JSON by contract and
 * points are typed arrays — so it is derived at PLAY start from what the node DRAWS, by the
 * studio, which is where the geometry lives.
 */
export type ColliderShape =
  /**
   * `at` is where the box's CENTRE stands in the body's own frame. A cloud of points carries its
   * own placement; a box read off a bounding box does not, and one assumed centred on the origin
   * would sit beside the solid it was measured from.
   */
  | { kind: 'cuboid'; hx: number; hy: number; hz: number; at?: Vector3 }
  | { kind: 'ball'; radius: number }
  /** `halfHeight` is the straight part only — the caps stand on top of it, as both engines count. */
  | { kind: 'capsule'; halfHeight: number; radius: number }
  | { kind: 'cylinder'; halfHeight: number; radius: number }
  | { kind: 'cone'; halfHeight: number; radius: number }
  /** A cloud the engine takes the hull of. Flat triples, `x y z x y z`. */
  | { kind: 'hull'; points: Float32Array }
  /** The exact, disjoint pieces of a carved solid — ADR-25, never an approximate decomposition. */
  | { kind: 'convexes'; parts: readonly Float32Array[] }
  | { kind: 'trimesh'; vertices: Float32Array; indices: Uint32Array }
  /**
   * A grid of world-Y samples, row-major along X then Z. `scale.x` / `scale.z` are metres per
   * sample; `scale.y` multiplies the stored height. The engine that cannot represent a rectangle
   * pads; this type does not.
   */
  | {
      kind: 'heightfield'
      heights: Float32Array
      width: number
      height: number
      offset: Vector3
      scale: Vector3
    }

/** Four points is a tetrahedron, and the least that encloses anything at all. */
export const HULL_FLOOR = 4
