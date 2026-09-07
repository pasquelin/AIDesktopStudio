/**
 * The port onto the skinning worker: what a rig looks like on the wire, and who is waiting.
 *
 * `workerPort` holds the worker and the register; what is here is the wire — a request that
 * answers many times, and a caller that can take one back, neither of which `bvhBuilder` carries.
 */
import { isIkHandle, type Rig } from '@shared/domain/rig'
import {
  HUMANOID_FINGERS,
  type HumanoidFinger,
  type HumanoidRole,
  type HumanoidSide,
} from '@shared/domain/humanoid'
import type { Vector3 } from '@shared/domain/transform'
import {
  INFLUENCES,
  SKIN_REGIONS,
  type SkinRegion,
  type SkinRequest,
  type SkinResponse,
} from './skinMessage'
import type { SkinBinding } from './skinVertices'
import { createWorkerPort } from '../core/workerPort'
import { ORIGIN, worldPlaces } from './rigWorld'
import { evenRange } from '../core/evenRange'
import { workerPoolSize } from '../core/workerPoolSize'

export type SkinWeights = {
  /**
   * Weights a mesh against a rig. `null` means the request was taken back, or the port let go
   * while it was out — an awaited promise nobody answers never ends.
   */
  bind: (
    positions: Float32Array,
    rig: Rig,
    watch?: { onProgress?: (progress: number) => void; signal?: AbortSignal },
  ) => Promise<SkinBinding | null>
  dispose: () => void
}

const VERTICES_PER_WORKER = 50_000

export function createSkinWeights(
  spawn: () => Worker,
  maximumWorkers = workerPoolSize(),
): SkinWeights {
  const ports = Array.from({ length: Math.max(1, Math.floor(maximumWorkers)) }, () =>
    createWorkerPort<SkinBinding, SkinResponse>(spawn, 'skinning', answer => ({
      skinIndex: answer.skinIndex,
      skinWeight: answer.skinWeight,
    })),
  )

  return {
    bind: (positions, rig, watch) => bindAcross(ports, positions, rig, watch),

    dispose: () => ports.forEach(port => port.dispose()),
  }
}

async function bindAcross(
  ports: ReturnType<typeof createWorkerPort<SkinBinding, SkinResponse>>[],
  positions: Float32Array,
  rig: Rig,
  watch?: { onProgress?: (progress: number) => void; signal?: AbortSignal },
): Promise<SkinBinding | null> {
  const wire = wireOf(positions, rig)
  const vertices = Math.floor(positions.length / 3)
  const workers = Math.min(ports.length, Math.max(1, Math.floor(vertices / VERTICES_PER_WORKER)))
  if (workers === 1) {
    return (
      ports[0]?.send(id => {
        const request: SkinRequest = { id, ...wire }
        return { message: request, transfer: [request.position.buffer, request.segments.buffer] }
      }, watch) ?? null
    )
  }

  const progress = new Float64Array(workers)
  const sizes = new Uint32Array(workers)
  const requests = ports.slice(0, workers).map((port, worker) => {
    const { from, to } = evenRange(vertices, workers, worker)
    sizes[worker] = to - from
    return port.send(
      id => {
        const request: SkinRequest = {
          id,
          position: positions.slice(from * 3, to * 3),
          segments: wire.segments.slice(),
          regions: wire.regions,
        }
        return { message: request, transfer: [request.position.buffer, request.segments.buffer] }
      },
      {
        signal: watch?.signal,
        onProgress: value => {
          progress[worker] = value
          watch?.onProgress?.(
            progress.reduce((total, part, index) => total + part * (sizes[index] ?? 0), 0) /
              vertices,
          )
        },
      },
    )
  })
  const bindings = await Promise.all(requests)
  if (bindings.some(binding => binding === null)) return null

  const skinIndex = new Uint16Array(vertices * INFLUENCES)
  const skinWeight = new Float32Array(vertices * INFLUENCES)
  let offset = 0
  for (const binding of bindings) {
    if (!binding) return null
    skinIndex.set(binding.skinIndex, offset)
    skinWeight.set(binding.skinWeight, offset)
    offset += binding.skinIndex.length
  }
  return { skinIndex, skinWeight }
}

/**
 * How far past itself a leaf reaches, as a fraction of the bone arriving at it.
 *
 * 🛑 Measured as a POINT it never won a vertex against its parent's segment: on tripo-character
 * the hand, the head and the toes drove no skin at all, so a hand posed left its own flesh behind.
 */
const LEAF_REACH = 1

/** A rig as numbers: one segment and one region per bone, in the order the bones are spelled. */
export function wireOf(positions: Float32Array, rig: Rig): Omit<SkinRequest, 'id'> {
  const world = worldPlaces(rig.bones)
  const segments = new Float32Array(rig.bones.length * 6)
  const regions = new Uint8Array(rig.bones.length)

  rig.bones.forEach((bone, index) => {
    const head = world.get(bone.name) ?? ORIGIN
    const child = world.get(rig.bones.find(one => one.parent === bone.name)?.name ?? '')
    // A bone reaches towards its first child; a leaf carries its parent's direction on.
    const tail = child ?? leafTail(head, bone.parent === null ? null : world.get(bone.parent))

    segments.set([head.x, head.y, head.z, tail.x, tail.y, tail.z], index * 6)
    regions[index] = SKIN_REGIONS.indexOf(isIkHandle(bone.name) ? 'handle' : regionOf(bone.role))
  })

  return { position: positions, segments, regions }
}

/** Where a childless bone ends: on past itself, along the bone that arrives at it. */
function leafTail(head: Vector3, parent: Vector3 | undefined | null): Vector3 {
  if (!parent) return head

  return {
    x: head.x + (head.x - parent.x) * LEAF_REACH,
    y: head.y + (head.y - parent.y) * LEAF_REACH,
    z: head.z + (head.z - parent.z) * LEAF_REACH,
  }
}

/**
 * Which part of the body a role belongs to. A bone filling no role is trunk — it agrees with
 * everything, which is the safe answer for a rig this studio did not build.
 */
export function regionOf(role: HumanoidRole | undefined): SkinRegion {
  if (!role) return 'trunk'
  if (role === 'Neck' || role === 'Head') return 'head'

  const side = role.startsWith('Left') ? 'Left' : role.startsWith('Right') ? 'Right' : null
  if (!side) return 'trunk'

  const part = role.slice(side.length)
  if (LEG_PARTS.some(leg => part.startsWith(leg))) return side === 'Left' ? 'legLeft' : 'legRight'

  // A finger before the arm, and never the arm alone — see `SkinRegion`.
  const finger = HUMANOID_FINGERS.find(one => part.startsWith(one))
  if (finger) return FINGER_REGIONS[finger][side]

  return side === 'Left' ? 'armLeft' : 'armRight'
}

const LEG_PARTS: readonly string[] = ['UpperLeg', 'LowerLeg', 'Foot', 'Toes']

/** Written out rather than composed: `toLowerCase` answers a `string`, which is not a region. */
const FINGER_REGIONS: Record<HumanoidFinger, Record<HumanoidSide, SkinRegion>> = {
  Thumb: { Left: 'thumbLeft', Right: 'thumbRight' },
  Index: { Left: 'indexLeft', Right: 'indexRight' },
  Middle: { Left: 'middleLeft', Right: 'middleRight' },
  Ring: { Left: 'ringLeft', Right: 'ringRight' },
  Little: { Left: 'littleLeft', Right: 'littleRight' },
}
