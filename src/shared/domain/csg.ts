/**
 * A solid cut out of other solids — the boolean graph, as a document stores it.
 *
 * ADR-25 makes this the truth and the evaluated mesh a cache: the graph is what a save writes,
 * what a reload rebuilds from, and what a "separate" gives back. A mesh alone would make the
 * edit destructive and the geometry impossible to throw away.
 *
 * It carries the SHAPE of every brush, never a node id: a node that has been folded into a solid
 * no longer exists, so an id would designate nothing — the criterion ADR-24 named.
 */
import type { GeometryDescriptor } from './geometry'
import type { MaterialDescriptor } from './scene'
import { IDENTITY_TRANSFORM, type Transform } from './transform'

/**
 * What one step does to what came before it. Named for what a hand means by them rather than for
 * the set theory: the toolbar says "percer", and the registry has to read back the same way.
 */
export type CsgOperation = 'subtract' | 'unite' | 'intersect'

export const CSG_OPERATIONS: readonly CsgOperation[] = ['subtract', 'unite', 'intersect']

/**
 * How much of a solid the physics is allowed to feel. Taken by ADR-25 while the field was free,
 * on documents nothing simulated; read since the physics arrived, by `colliderFromNode` — where
 * `convexes` is the exact decomposition and the others are what an author settles for.
 */
export type CollisionFidelity = 'box' | 'hull' | 'convexes' | 'trimesh'

/** One brush of the graph: a shape, where it stands, and what it goes back to on separate. */
export type CsgPart = {
  name: string
  /**
   * A primitive, OR a whole recipe — a solid folded into another solid.
   *
   * Recursive on purpose. A flat list of steps could only have kept such a brush's BASE shape and
   * dropped every cut already made in it, so the toolbar used to refuse the gesture outright.
   * Refusing protected the shortcoming instead of lifting it, and chaining booleans is what every
   * modeller does — Roblox included.
   */
  geometry: GeometryDescriptor | CsgGraph
  /** In the solid's own frame, so moving the solid moves everything it was cut from. */
  transform: Transform
  /**
   * What the brush wore before the fold. Taken now, while it is free: welding a red cube to a
   * blue sphere and separating them would otherwise hand both back in the solid's colour, and
   * adding the field later means migrating every document already written.
   *
   * Not read by the cut itself — the solid wears one material — and deliberately absent from the
   * cache key: two solids of the same shape share one mesh whatever their brushes were painted.
   */
  material: MaterialDescriptor
}

type CsgStep = {
  operation: CsgOperation
  part: CsgPart
}

/**
 * The whole recipe. `base` is what the others are applied TO, in order — a list rather than a
 * tree because that is what the toolbar can produce: one selection, one operation, one step.
 */
export type CsgGraph = {
  base: CsgPart
  steps: readonly CsgStep[]
  collision: CollisionFidelity
}

export function csgPartOf(
  name: string,
  geometry: GeometryDescriptor | CsgGraph,
  material: MaterialDescriptor,
): CsgPart {
  return { name, geometry, transform: IDENTITY_TRANSFORM, material }
}

/**
 * Whether a brush carries a recipe rather than a primitive. Reads `base`, which a
 * `GeometryDescriptor` never has — its own discriminant is `kind`.
 */
export function isCsgGraph(shape: GeometryDescriptor | CsgGraph): shape is CsgGraph {
  return 'base' in shape
}

/**
 * The first real shape a recipe rests on, however deep it is nested — what a solid wears while
 * its cut is still out, since a graph has no geometry of its own to draw.
 */
export function primitiveOf(part: CsgPart): GeometryDescriptor {
  return isCsgGraph(part.geometry) ? primitiveOf(part.geometry.base) : part.geometry
}
