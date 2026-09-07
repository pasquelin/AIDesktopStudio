import { glbChunksOf, glbJson, glbFrom } from '@shared/domain/glbContainer'
import { isRecord } from '@shared/guards'
import { boneRolesOf } from '@/engines/scene/boneRoles'
import { skeletonTopologySignatureOf, type SkeletonProfile } from '@shared/domain/skeletonProfile'
import type { WireBone, WireClip } from '@/engines/scene/retargetMessage'
import { disposeTree } from '@/engines/scene/modelCache'
import type { SkinnedMesh } from 'three'
import {
  clipFromWire,
  namedBonesOf,
  skinnedFromWire,
  wireClipOf,
  type Retarget,
} from '@/engines/scene/retarget'
import { exportObjects } from '@/engines/scene/sceneExport'

export function motionProfile(bones: readonly WireBone[]): SkeletonProfile {
  const named = namedBonesOf(bones)
  return { signature: skeletonTopologySignatureOf(named), roles: boneRolesOf(named) }
}

export async function exportRetarget(
  bones: readonly WireBone[],
  clip: WireClip,
): Promise<Uint8Array> {
  const skeleton = skinnedFromWire(bones)
  try {
    // The animation asset contains only bones; the character keeps its own mesh and weights.
    const bytes = await exportObjects(skeleton.children, 'glb', {
      clipsFor: () => [clipFromWire(clip)],
    })
    const chunks = glbChunksOf(bytes)
    const json = chunks && glbJson(chunks.json)
    if (!chunks || !isRecord(json) || !Array.isArray(json.nodes))
      throw new Error('invalid animation export')
    const names = new Set(bones.map(bone => bone.name))
    const joints = json.nodes.flatMap((node, index) =>
      isRecord(node) && typeof node.name === 'string' && names.has(node.name) ? [index] : [],
    )
    if (joints.length !== bones.length) throw new Error('missing exported joints')
    json.skins = [{ joints }]
    return glbFrom({ ...chunks, json: new TextEncoder().encode(JSON.stringify(json)) })
  } finally {
    freeSkeleton(skeleton)
  }
}

export async function adaptWireClip(
  retarget: Retarget,
  target: readonly WireBone[],
  source: readonly WireBone[],
  clip: WireClip,
  watch: Parameters<Retarget['adapt']>[3],
): Promise<WireClip | null> {
  const from = skinnedFromWire(source)
  const to = skinnedFromWire(target)
  try {
    const adapted = await retarget.adapt(to, from, [clipFromWire(clip)], watch)
    return adapted?.[0] ? wireClipOf(adapted[0]) : null
  } finally {
    freeSkeleton(from)
    freeSkeleton(to)
  }
}

function freeSkeleton(skeleton: SkinnedMesh): void {
  skeleton.skeleton.dispose()
  disposeTree(skeleton)
}
