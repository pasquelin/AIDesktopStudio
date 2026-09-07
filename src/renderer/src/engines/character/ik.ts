/**
 * Inverse kinematics over a rig: a chain of bones turned so its end arrives somewhere.
 *
 * The arithmetic is three's `CCDIKSolver`, which ships with it — no dependency was added. What
 * lives here is everything that solver refuses to know: it addresses `Skeleton.bones` BY INDEX,
 * and the document holds names, because a bone gets renamed and an index does not survive an
 * edit of the hierarchy.
 */
import type { SkinnedMesh } from 'three'
import { CCDIKSolver } from 'three/addons/animation/CCDIKSolver.js'
import type { IkChain } from '@shared/domain/rig'

/** One chain as the solver takes it: bone indices, and how many passes to make. */
export type IkSpec = {
  target: number
  effector: number
  links: { index: number }[]
  iteration: number
}

/** What one pass costs against what it buys. Blender's own default for a CCD chain. */
const DEFAULT_ITERATIONS = 10

/**
 * The chains a skeleton of these bones can actually solve, in the solver's own vocabulary.
 *
 * A chain naming a bone that is no longer there is DROPPED, never repaired: the hierarchy is
 * edited by hand, and a chain left half-resolved would turn the wrong joint in silence. Same for
 * one whose effector IS its target — the solver would divide by a zero-length vector.
 */
export function ikSpecsOf(boneNames: readonly string[], chains: readonly IkChain[]): IkSpec[] {
  const indexOf = new Map(boneNames.map((name, index) => [name, index]))
  const specs: IkSpec[] = []

  for (const chain of chains) {
    const target = indexOf.get(chain.target)
    const effector = indexOf.get(chain.effector)
    if (target === undefined || effector === undefined || target === effector) continue

    const links = chain.links
      .map(name => indexOf.get(name))
      .filter(index => index !== undefined)
      .map(index => ({ index }))
    // A chain with nothing left to turn reaches nothing, and the solver walks it every frame.
    if (links.length === 0) continue

    specs.push({ target, effector, links, iteration: chain.iterations ?? DEFAULT_ITERATIONS })
  }

  return specs
}

/**
 * The bones above a joint, nearest first — what a chain is allowed to turn.
 *
 * Bounded because a chain is not a whole body: reaching a handle bends the elbow and the
 * shoulder, and letting it climb to the hips would walk the character across the room.
 */
export function ikLinksOf(
  bones: readonly { name: string; parent: string | null }[],
  effector: string,
  depth = 2,
): string[] {
  const parentOf = new Map(bones.map(bone => [bone.name, bone.parent]))
  const links: string[] = []

  let name = parentOf.get(effector) ?? null
  while (name !== null && links.length < depth) {
    links.push(name)
    name = parentOf.get(name) ?? null
  }
  return links
}

export type IkBinding = { update: () => void }

/** `null` when nothing is worth solving, so the render loop pays for no chain at all. */
export function createIkBinding(mesh: SkinnedMesh, specs: readonly IkSpec[]): IkBinding | null {
  if (specs.length === 0) return null

  const solver = new CCDIKSolver(mesh, [...specs])
  return { update: () => solver.update() }
}
