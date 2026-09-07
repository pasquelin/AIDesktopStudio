import type { Object3D } from 'three'

/** One drawn or clickable stretch of a skeleton: a bone towards ONE of its children, or its stub. */
export type BoneLink<B extends Object3D> = { bone: B; child: B | null }

/**
 * Every stretch a skeleton is made of, in bone order: one per CHILD — the hips carry the spine
 * and both legs — and one with `null` for a bone with no child, where a stub is drawn.
 */
export function boneLinksOf<B extends Object3D>(bones: readonly B[]): BoneLink<B>[] {
  const held = new Set<Object3D>(bones)
  return bones.flatMap((bone): BoneLink<B>[] => {
    const children = bone.children.filter((child): child is B => held.has(child))
    return children.length > 0 ? children.map(child => ({ bone, child })) : [{ bone, child: null }]
  })
}
