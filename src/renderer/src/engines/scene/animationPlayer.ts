import { LoopRepeat, type AnimationClip, type AnimationMixer } from 'three'
import type { BodyPart } from '@shared/domain/humanoid'
import type { ClipLane, ClipRef } from '@shared/domain/scene'
import type { SkeletonBone } from './rigState'
import type { PosedClip } from '@game/ports/animationPort'
import { blockClip, travelsWith } from './rootMotion'
import { bonesDrivenBy } from './boneRoles'

/** One block of the document, and the clip object it plays. */
type Bound = {
  ref: ClipRef
  /** Whether that object kept the travel, so a decision that flips rebuilds it. */
  travel: boolean
  /** Which entry of `clips` it was built from, so a block pointed elsewhere is rebuilt. */
  key: string
  /** Which bones that object was cut down to, so a block given another half is rebuilt too. */
  part: BodyPart
  clip: AnimationClip
}

export type Player = {
  mixer: AnimationMixer
  /**
   * Every clip this model can play, by `clipKeyOf` — its file's own, and whatever was retargeted
   * onto it since. FIRST WINS on a key held twice, and so does `lengths`: a Mixamo export calls
   * every clip `mixamo.com`, and two answers here would play one clip at another's width.
   */
  clips: Map<string, AnimationClip>
  /** The names the model's OWN file spells, which is what a panel offers a choice from. */
  fileNames: readonly string[]
  fileClips: readonly AnimationClip[]
  /** The bones the clips play on, kept so a clip arriving later can be read against them. */
  bones: readonly SkeletonBone[]
  /**
   * Which bones each half of this body covers, worked out at most once per half: reading the
   * roles walks all fifty-two, and it depends on the skeleton alone.
   */
  driven: Map<BodyPart, ReadonlySet<string> | null>
  /** How long each clip runs, which is what a block's width is derived from. */
  lengths: Record<string, number>
  /** The travel channel of each clip, worked out once — it depends on the file and the rig alone. */
  rootTracks: Map<string, string | null>
  /** The lanes as the document holds them. `bound` alone would lose which lane a block lies in. */
  lanes: readonly ClipLane[]
  /** One entry per block the document holds, keyed by block id. */
  bound: Map<string, Bound>
  /**
   * What a STATE MACHINE plays on this model, keyed by `posedIdOf`, and whether one drives it.
   *
   * 🛑 One mixer per skeleton, so the two clocks cannot share it: a body an `Animator` drives
   * leaves the band entirely — Alban's arbitration, 2026-09-06 — and gets it back on `release`.
   */
  posed: Map<string, AnimationClip>
  graphDriven: boolean
}

/** What a posed clip is filed under: the same clip on another half of the body is another one. */
const posedIdOf = (clip: PosedClip): string => `${clip.key}|${clip.part}|${clip.rootMotion}`

/** The bones a half of this body covers, read once per half — the roles walk every bone. */
export function drivenIn(player: Player, part: BodyPart): ReadonlySet<string> | null {
  if (!player.driven.has(part)) player.driven.set(part, bonesDrivenBy(player.bones, part))
  return player.driven.get(part) ?? null
}

/**
 * What a state machine plays on this model, in place of its band: a weight and a time per clip,
 * written straight in as `place` does — the machine is the only clock, exactly as the head is.
 */
export function posePlayer(player: Player, clips: readonly PosedClip[]): void {
  if (!player.graphDriven) {
    // Off the band in one gesture: two sets of actions on one mixer fight bone by bone.
    for (const held of player.bound.values()) player.mixer.uncacheClip(held.clip)
    player.bound.clear()
    player.mixer.stopAllAction()
    player.graphDriven = true
  }

  // The id composed ONCE per clip, and two clips sharing it ADD UP rather than one replacing the
  // other: two states of a graph playing the same file are one pose at their two weights, and
  // keeping the last would have made the body sag towards its rest pose for the whole fade.
  const kept = new Map<string, PosedClip>()
  for (const clip of clips) {
    const id = posedIdOf(clip)
    if (!bindPosed(player, id, clip)) continue
    const already = kept.get(id)
    kept.set(id, already ? { ...clip, weight: already.weight + clip.weight } : clip)
  }
  for (const [id, held] of player.posed) {
    if (kept.has(id)) continue
    player.mixer.uncacheClip(held)
    player.posed.delete(id)
  }

  for (const [id, clip] of kept) written(player, id, clip)
  player.mixer.update(0)
}

/** Always looping and always paused: where inside the clip is the machine's answer, not a clock. */
function written(player: Player, id: string, clip: PosedClip): void {
  const held = player.posed.get(id)
  if (!held) return

  const action = player.mixer.clipAction(held)
  action.loop = LoopRepeat
  action.play()
  action.paused = true
  action.enabled = true
  action.weight = clip.weight
  action.time = clip.time
}

/** Everything the machine held, let go. The caller puts the lanes back on. */
export function releasePlayer(player: Player): void {
  for (const held of player.posed.values()) player.mixer.uncacheClip(held)
  player.posed.clear()
  player.mixer.stopAllAction()
  player.graphDriven = false
}

/** Cuts the clip a state machine names, once per key and half of body. */
function bindPosed(player: Player, id: string, clip: PosedClip): boolean {
  const source = player.clips.get(clip.key)
  if (!source) return false
  if (player.posed.has(id)) return true

  const travel = travelsWith(clip.rootMotion, false)
  const track = player.rootTracks.get(clip.key) ?? null
  player.posed.set(id, blockClip(source, track, travel, drivenIn(player, clip.part)))
  return true
}
