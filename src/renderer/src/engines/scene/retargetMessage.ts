/**
 * What crosses to the retargeting worker and back, on `skinMessage`'s pattern.
 *
 * Numbers and strings only: neither a `Bone` nor an `AnimationClip` is structured-cloneable, so
 * both skeletons and every clip are spelled out and rebuilt on the far side.
 */

/** One bone, flattened. Parents come before their children, so `parent` always points backwards. */
export type WireTransform = {
  position: readonly [number, number, number]
  quaternion: readonly [number, number, number, number]
  scale: readonly [number, number, number]
  /**
   * On a ROOT only, and only when something stands above it: the sixteen numbers of whatever a
   * glTF hangs the rig under. 🛑 BESIDE the bone, never folded into it — `retargetClip` writes
   * each local as `parent.matrixWorld⁻¹ · global`, so a folded frame comes back out unremoved and
   * the real armature applies it twice: measured 2026-09-06, a hip at (0, 0, 1) replayed at
   * (0, −0,01, 0). `skinnedFromWire` hangs it as a node, and three undoes it on its own.
   */
  frame?: readonly number[]
}

export type WireBone = WireTransform & {
  name: string
  /** An index into the same list; `-1` for a root. */
  parent: number
  /** Asset-local non-joint ancestors, outermost first; scene placement is excluded. */
  parentFrames?: readonly WireTransform[]
}

/** Which `KeyframeTrack` to rebuild. Carried rather than guessed from the property name. */
export type WireTrackKind = 'quaternion' | 'vector' | 'number'

export type WireTrack = {
  /** `Bone.quaternion` — the node spelling glTF uses, never `.bones[Bone].quaternion`. */
  name: string
  kind: WireTrackKind
  times: Float32Array
  values: Float32Array
}

export type WireClip = {
  name: string
  duration: number
  tracks: readonly WireTrack[]
}

export type RetargetOptions = {
  /** Omitted means measured from the two skeletons. */
  scale?: number
  rootMotion?: 'travel' | 'inPlace'
}

export type RetargetRequest = {
  options?: RetargetOptions
  id: number
  /** The skeleton the clips will play on. */
  target: readonly WireBone[]
  /** The skeleton they were authored for. */
  source: readonly WireBone[]
  clips: readonly WireClip[]
  /**
   * `names[targetBoneName] = sourceBoneName`, and that direction is not guessable: three walks
   * the TARGET's bones and looks each one's source up. Read out of `SkeletonUtils.getBoneName`.
   */
  names: Readonly<Record<string, string>>
  /** The hips, under their SOURCE name — the one bone whose translation is carried over. */
  hip?: string
  /**
   * How finely the source is sampled, or nothing to sample it at its own density.
   *
   * Nothing is the DEFAULT, and a fixed rate would be a loss: the two measured provider files
   * disagree — Tripo's walk is 24 fps, Uthana's motion 30 — so any number resamples one of them
   * for no reason. Left out, `retargetClip` reads the rate off the busiest track of the clip.
   */
  fps?: number
}

/** Takes a request back. The worker stops between clips and says nothing more about it. */
export type RetargetCancel = { id: number; cancel: true }

export type RetargetIncoming = RetargetRequest | RetargetCancel

export type RetargetResponse =
  /**
   * One clip done, out of however many were asked for. The grain is the clip and cannot be finer:
   * `retargetClip` is a single opaque loop inside three, which reports nothing as it runs.
   */
  | { id: number; done: false; progress: number }
  | { id: number; done: true; ok: true; clips: readonly WireClip[] }
  | { id: number; done: true; ok: false; error: string }

export function isRetargetCancel(message: RetargetIncoming): message is RetargetCancel {
  return 'cancel' in message
}

/** Every buffer a request or an answer carries, for `postMessage` to hand over rather than copy. */
export function clipBuffers(clips: readonly WireClip[]): Transferable[] {
  return clips.flatMap(clip =>
    clip.tracks.flatMap(track => [track.times.buffer, track.values.buffer]),
  )
}
