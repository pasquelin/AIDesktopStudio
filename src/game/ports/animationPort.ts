// SPDX-License-Identifier: MIT

import type { BodyPart } from '@shared/domain/humanoid'
import type { RootMotion } from '@shared/domain/sceneModel'

/**
 * One clip showing on a body this frame: which one, where inside it, and how much of the pose it
 * contributes. Two of them with weights summing to one is a cross-fade.
 *
 * 🛑 A KEY and never a clip object — `clipKeyOf` spells it. This tree draws nothing and knows no
 * three.js: what a key resolves to belongs to whatever holds the mixer.
 */
export type PosedClip = {
  key: string
  /** Where inside the clip, in seconds. */
  time: number
  weight: number
  part: BodyPart
  rootMotion: RootMotion
}

/**
 * What poses a body from a state machine rather than from a band.
 *
 * 🛑 `pose` REPLACES whatever else drove that body, and `release` gives it back — a host holding
 * one mixer per model cannot let two clocks write the same bones. `world.dispose` gives every
 * port holding back, and this is one of them: without the release, stopping a game would leave
 * the character frozen in his last playing pose.
 *
 * 🛑 The clips are BORROWED for the length of the call: the animator hands out pooled objects it
 * writes over on the next frame, so a host that keeps one reads a body's pose from two frames ago.
 * What a host needs past the call it copies.
 */
export type AnimationPort = {
  pose: (entity: string, clips: readonly PosedClip[]) => void
  release: (entity: string) => void
  /** Every body this has posed, given back at once. What a stop owes, and what a swap owes. */
  releaseAll: () => void
  /**
   * How long each clip that body can play runs, in seconds, by key.
   *
   * The runtime holds no file, and a state machine cannot loop, finish or place a footfall
   * without a length. A key absent has not landed yet — the state holds and poses nothing.
   */
  lengths: (entity: string) => Readonly<Record<string, number>>
}
