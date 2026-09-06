import { isSkeletonProfile, type SkeletonProfile } from '@shared/domain/skeletonProfile'
import { isRecord } from '@shared/guards'
import { isRig, type Rig } from '@shared/domain/rig'
import { autoRigBindingFaultOf, type AutoRigSkinBinding } from '@shared/domain/autoRig'

export type RetargetSnapshot = {
  assetId: string
  name: string
  revision: number
  incarnation: string
  rig: Rig | null
  bindings?: readonly AutoRigSkinBinding[]
  profiles?: readonly SkeletonProfile[]
}
export type RetargetMessage =
  | { kind: 'ask' }
  | { kind: 'gone' }
  | { kind: 'editRig'; incarnation: string }
  | { kind: 'snapshot'; snapshot: RetargetSnapshot }
  /** The character moved on without its rig changing: enough to tell a draft it is stale. */
  | { kind: 'changed'; revision: number; incarnation: string }
  | {
      kind: 'apply'
      requestId: string
      revision: number
      incarnation: string
      name: string
      glb: Uint8Array
      profiles?: readonly SkeletonProfile[]
    }
  | { kind: 'answer'; requestId: string; ok: boolean }

export function openRetargetChannel(sessionId: string): BroadcastChannel {
  return new BroadcastChannel(`ia-studio.retarget.${sessionId}`)
}

export function retargetMessageOf(data: unknown): RetargetMessage | null {
  if (!isRecord(data)) return null
  if (data.kind === 'ask' || data.kind === 'gone') return { kind: data.kind }
  if (data.kind === 'editRig' && typeof data.incarnation === 'string' && data.incarnation)
    return { kind: 'editRig', incarnation: data.incarnation }
  if (data.kind === 'answer' && typeof data.requestId === 'string' && typeof data.ok === 'boolean')
    return { kind: 'answer', requestId: data.requestId, ok: data.ok }
  if (
    data.kind === 'changed' &&
    typeof data.revision === 'number' &&
    Number.isSafeInteger(data.revision) &&
    typeof data.incarnation === 'string' &&
    data.incarnation
  )
    return { kind: 'changed', revision: data.revision, incarnation: data.incarnation }
  if (data.kind === 'snapshot' && isSnapshot(data.snapshot))
    return { kind: 'snapshot', snapshot: data.snapshot }
  if (isApply(data)) return data
  return null
}

function isSnapshot(value: unknown): value is RetargetSnapshot {
  if (!isRecord(value)) return false
  const rig = value.rig
  return (
    typeof value.assetId === 'string' &&
    typeof value.name === 'string' &&
    Number.isSafeInteger(value.revision) &&
    typeof value.incarnation === 'string' &&
    (rig === null || isRig(rig)) &&
    (value.profiles === undefined ||
      (Array.isArray(value.profiles) && value.profiles.every(isSkeletonProfile))) &&
    (value.bindings === undefined ||
      (Array.isArray(value.bindings) &&
        value.bindings.every(binding => isBinding(binding, rig?.bones.length ?? 0))))
  )
}

function isApply(
  data: Record<string, unknown>,
): data is Extract<RetargetMessage, { kind: 'apply' }> {
  return (
    data.kind === 'apply' &&
    typeof data.requestId === 'string' &&
    Number.isSafeInteger(data.revision) &&
    typeof data.incarnation === 'string' &&
    typeof data.name === 'string' &&
    data.name.trim().length > 0 &&
    data.name.length <= 256 &&
    data.glb instanceof Uint8Array &&
    data.glb.byteLength > 12 &&
    data.glb.byteLength <= 256 * 1024 * 1024 &&
    (data.profiles === undefined ||
      (Array.isArray(data.profiles) &&
        data.profiles.length <= 2 &&
        data.profiles.every(isSkeletonProfile)))
  )
}

function isBinding(value: unknown, boneCount: number): value is AutoRigSkinBinding {
  if (
    !isRecord(value) ||
    typeof value.mesh !== 'number' ||
    typeof value.primitive !== 'number' ||
    !(value.skinIndex instanceof Uint16Array) ||
    !(value.skinWeight instanceof Float32Array) ||
    value.skinIndex.length % 4 !== 0
  )
    return false
  return (
    autoRigBindingFaultOf(
      {
        mesh: value.mesh,
        primitive: value.primitive,
        skinIndex: value.skinIndex,
        skinWeight: value.skinWeight,
      },
      value.skinIndex.length / 4,
      boneCount,
    ) === null
  )
}
