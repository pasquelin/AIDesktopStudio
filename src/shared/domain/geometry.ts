/**
 * The shapes a mesh can wear, and nothing else.
 *
 * Apart from `scene.ts`, which re-exports it, for the reason `transform.ts` left: a carved solid
 * holds the shape of every brush it was cut from, so `csg.ts` needs this while `scene.ts` needs a
 * `CsgGraph` — and the two together would close the cycle `import-cycles.test.ts` holds at zero.
 */

/**
 * Each primitive carries its own parameters rather than a shared bag of optionals: a sphere has
 * no depth, and a type that lets it have one stops describing anything.
 */
import type { PathDescriptor } from './path'

export type GeometryDescriptor =
  | { kind: 'box'; width: number; height: number; depth: number }
  /**
   * A band swept along a run of points — a kerb, a road, a river bank.
   *
   * 🛑 The one shape a run of boxes cannot make. Laid end to end they leave a wedge at every
   * turn; overlapped to close it, their corners stand proud and the band reads as a staircase.
   * Here each joint is cut on the BISECTOR, so two sections share an edge and nothing overlaps.
   */
  | {
      kind: 'ribbon'
      /** The very descriptor a rail carries, so a band is edited by the tools a rail already has. */
      path: PathDescriptor
      width: number
      height: number
      /** How many cross-sections the curve is cut into. What makes a turn round rather than a corner. */
      segments: number
    }
  | { kind: 'capsule'; radius: number; height: number; capSegments: number; radialSegments: number }
  | { kind: 'circle'; radius: number; segments: number }
  | { kind: 'cylinder'; radiusTop: number; radiusBottom: number; height: number; segments: number }
  | { kind: 'dodecahedron'; radius: number }
  | { kind: 'icosahedron'; radius: number }
  | { kind: 'lathe'; segments: number }
  | { kind: 'octahedron'; radius: number }
  | { kind: 'plane'; width: number; height: number }
  | { kind: 'ring'; innerRadius: number; outerRadius: number; segments: number }
  | { kind: 'sphere'; radius: number; widthSegments: number; heightSegments: number }
  | { kind: 'tetrahedron'; radius: number }
  | { kind: 'torus'; radius: number; tube: number; radialSegments: number; tubularSegments: number }
  | {
      kind: 'torusKnot'
      radius: number
      tube: number
      tubularSegments: number
      radialSegments: number
      p: number
      q: number
    }
  | { kind: 'tube'; radius: number; tubularSegments: number; radialSegments: number }
