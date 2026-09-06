import { AnimationClip, QuaternionKeyframeTrack } from 'three'
import type { RetargetIncoming, RetargetResponse, WireBone } from './retargetMessage'

export function boneAt(name: string, parent: number, y: number, scale = 1): WireBone {
  return {
    name,
    parent,
    position: [0, y, 0],
    quaternion: [0, 0, 0, 1],
    scale: [scale, scale, scale],
  }
}

/**
 * Mixamo's spelling AS THREE HOLDS IT: `GLTFLoader` runs every node name through
 * `PropertyBinding.sanitizeNodeName`, which DELETES `:` rather than replacing it. A bone still
 * named `mixamorig:Hips` binds to nothing — measured on the real file on 2026-08-18.
 */
export const UTHANA: WireBone[] = [
  boneAt('mixamorigHips', -1, 1),
  boneAt('mixamorigSpine', 0, 0.2),
  boneAt('mixamorigHead', 1, 0.4),
  boneAt('mixamorigLeftArm', 1, 0.3),
]

/** Tripo's, on a character twice as tall. */
export const TRIPO: WireBone[] = [
  boneAt('Hip', -1, 2),
  boneAt('Waist', 0, 0.4),
  boneAt('Head', 1, 0.8),
  boneAt('L_Upperarm', 1, 0.6),
  boneAt('L_UpperarmTwist01', 3, 0.1),
]

/**
 * A worker the test answers by hand, so what is under test is the register rather than three's
 * sampling — `skinWeights.test.ts` builds its fake the same way, and the cast is the same one:
 * the port calls exactly these members, and jsdom has no `Worker` at all.
 */
export function scriptedWorker() {
  const listeners = new Map<string, ((event: unknown) => void)[]>()
  const sent: RetargetIncoming[] = []
  let spawned = 0
  let terminated = 0

  const worker = {
    postMessage: (message: RetargetIncoming) => void sent.push(message),
    terminate: () => {
      terminated += 1
    },
    addEventListener: (kind: string, listener: (event: unknown) => void) =>
      void listeners.set(kind, [...(listeners.get(kind) ?? []), listener]),
  }

  return {
    spawn: () => {
      spawned += 1
      return worker as unknown as Worker
    },
    sent,
    get terminated() {
      return terminated
    },
    get spawned() {
      return spawned
    },
    answer: (response: RetargetResponse) => {
      for (const listener of listeners.get('message') ?? []) listener({ data: response })
    },
  }
}

export function turnClip(boneName: string): AnimationClip {
  return new AnimationClip('walk', 1, [
    new QuaternionKeyframeTrack(`${boneName}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0.7, 0, 0.7]),
  ])
}
