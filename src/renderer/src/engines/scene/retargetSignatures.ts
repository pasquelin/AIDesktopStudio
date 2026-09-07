/**
 * How a set of bones is IDENTIFIED, and what was recorded under that identity.
 *
 * Its own module rather than a corner of `retarget.ts`, which the size guard was refusing at 526
 * lines: what is here answers « which skeleton is this », where the rest of the port answers
 * « replay this motion on it ». `retarget.ts` re-exports it, as it does `retargetWire`, so no
 * consumer needs a second import.
 */
import { skeletonSignatureOf, skeletonTopologySignatureOf } from '@shared/domain/skeletonProfile'
import type { SkeletonProfile } from '@shared/domain/skeletonProfile'
import type { NamedBone } from './boneRoles'
import type { WireBone } from './retargetMessage'

/** The wire spells a parent as an index; reading roles wants it as a name. */
export function namedBonesOf(bones: readonly WireBone[]): NamedBone[] {
  return bones.map(bone => ({ name: bone.name, parent: bones[bone.parent]?.name ?? null }))
}

/**
 * 🛑 Both signatures are digests, and one `adapt` asks for them around thirty-five times for four
 * distinct sets of bones — `alignedBonesOf` twice, `profileOfBones` before and after the round
 * trip, `rolesOf` under `fitOf`. A `WireBone[]` is built once and never written to, so identity
 * is a sound key; the entry dies with the array.
 *
 * Each is filled SEPARATELY, and that is the point: `profileOfBones` only reaches for the second
 * when the first misses, and computing both eagerly would pay a digest the common case skips.
 */
const signatures = new WeakMap<readonly WireBone[], { topology?: string; names?: string }>()

function signaturesOf(bones: readonly WireBone[]): { topology?: string; names?: string } {
  const held = signatures.get(bones)
  if (held) return held
  const made = {}
  signatures.set(bones, made)
  return made
}

function topologySignature(bones: readonly WireBone[]): string {
  const held = signaturesOf(bones)
  held.topology ??= skeletonTopologySignatureOf(namedBonesOf(bones))
  return held.topology
}

function nameSignature(bones: readonly WireBone[]): string {
  const held = signaturesOf(bones)
  held.names ??= skeletonSignatureOf(bones.map(bone => bone.name))
  return held.names
}

/**
 * What was recorded for a skeleton of exactly these bones, under either identity it may wear.
 *
 * 🛑 The second `get` is a MIGRATION DOOR, not a fallback that never closes: v1.0.0 filed
 * corrections under a name-only key, and a stored profile carries no parents, so it can only be
 * re-keyed when a skeleton is READ. `profileForView` is where that happens.
 */
export function profileOfBones(
  bones: readonly WireBone[],
  known?: ReadonlyMap<string, SkeletonProfile>,
): SkeletonProfile | undefined {
  return known?.get(topologySignature(bones)) ?? known?.get(nameSignature(bones))
}
