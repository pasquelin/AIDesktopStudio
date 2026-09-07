import { AnimationMixer, LoopOnce, LoopRepeat, type AnimationClip, type Object3D } from 'three'
import { EMPTY_TIMELINE, type AnimationTimeline } from '@shared/domain/animation'
import { clipKeyOf, type ClipLane, type ClipRef } from '@shared/domain/scene'
import { WHOLE_BODY } from '@shared/domain/humanoid'
import type { Us } from '@shared/domain/time'
import { clipBlendAt, type ClipWeight } from './clipBlend'
import { skeletonBonesOf } from './rigState'
import { blockClip, nodeTravelsOnBand, rootTrackOf, travelsWith } from './rootMotion'
import { drivenIn, posePlayer, releasePlayer, type Player } from './animationPlayer'
export { foreignClipsOf, type ForeignClip } from './clipSources'
import type { PosedClip } from '@game/ports/animationPort'

/** The clips a loaded file brought, in the order it spells them. */
export function clipsOf(source: Object3D): AnimationClip[] {
  return source.animations
}

export function clipNamesOf(source: Object3D): string[] {
  return clipsOf(source).map(clip => clip.name)
}

/** How long each clip runs, by name — what a block on the band needs to be drawn its own width. */
export function clipLengthsOf(source: Object3D): Record<string, number> {
  return lengthsOf(clipsOf(source))
}

/** One place decides the shape of this record: the band and the mixer must read the same one. */
function lengthsOf(clips: readonly AnimationClip[]): Record<string, number> {
  const lengths: Record<string, number> = {}
  for (const clip of clips) lengths[clip.name] = clip.duration
  return lengths
}

/**
 * The animation clips of every model in the scene, driven from what the document says.
 *
 * A registry apart from the nodes, on `bvh-inflight`'s pattern: a mixer is a live three object
 * bound to one instance, while a document holds a clip name and four numbers. Keeping the two
 * apart is what lets a viewport be thrown away and rebuilt in another window — and it is what
 * makes any of this testable, since a mixer needs no GPU at all.
 *
 * The head is the ONLY clock here: nothing in this class advances on real time, weights and times
 * come out of `clipBlendAt`, and scrubbing backwards or rendering frame by frame both land on the
 * pose playing forwards would have shown.
 */
export class SceneAnimations {
  private readonly players = new Map<string, Player>()
  private timeline: AnimationTimeline = EMPTY_TIMELINE
  private playhead: Us = 0

  /**
   * Binds a node to the instance the file produced. The clips come from the cached SOURCE rather
   * than the clone: `Object3D.copy` does not carry them, and a clip addresses its targets by name.
   */
  add(nodeId: string, root: Object3D, clips: AnimationClip[]): void {
    // A file bringing NO clip is filed all the same: a bare rigged character is exactly what a
    // shipped animation is dropped onto, and there would be nothing here to hand it to.
    this.remove(nodeId)
    const bones = skeletonBonesOf(root)
    const byName = new Map<string, AnimationClip>()
    const rootTracks = new Map<string, string | null>()
    for (const clip of clips) {
      if (byName.has(clip.name)) continue

      byName.set(clip.name, clip)
      rootTracks.set(clip.name, rootTrackOf(clip, bones))
    }

    this.players.set(nodeId, {
      mixer: new AnimationMixer(root),
      clips: byName,
      fileNames: [...byName.keys()],
      fileClips: [...clips],
      bones,
      driven: new Map(),
      lengths: lengthsOf([...byName.values()]),
      rootTracks,
      lanes: [],
      bound: new Map(),
      posed: new Map(),
      graphDriven: false,
    })
  }

  /**
   * Files a clip this model did not bring — one shipped with the app, replayed on its skeleton.
   * Blocks naming it play nothing until it lands, so applying again is part of adding it.
   */
  addClip(nodeId: string, key: string, clip: AnimationClip): void {
    const player = this.players.get(nodeId)
    if (!player || player.clips.has(key)) return

    player.clips.set(key, clip)
    player.lengths[key] = clip.duration
    player.rootTracks.set(key, rootTrackOf(clip, player.bones))
    this.apply(nodeId, player.lanes)
  }

  /** Releases a transient clip and its actions from this model's single mixer. */
  removeClip(nodeId: string, key: string): void {
    const player = this.players.get(nodeId)
    if (!player || player.fileNames.includes(key)) return
    if (player.graphDriven) {
      // Leave the posed action: uncacheing it restores the bind pose for a frame.
      player.clips.delete(key)
      delete player.lengths[key]
      player.rootTracks.delete(key)
      return
    }
    const clip = player.clips.get(key)
    if (clip) player.mixer.uncacheClip(clip)
    player.clips.delete(key)
    delete player.lengths[key]
    player.rootTracks.delete(key)
    this.apply(nodeId, player.lanes)
  }

  /** How long each clip a node can play runs, by key — what the band draws its blocks from. */
  lengthsOf(nodeId: string): Readonly<Record<string, number>> {
    return this.players.get(nodeId)?.lengths ?? {}
  }

  /** The lanes this model was last applied, for whoever has to ask for its clips again. */
  lanesOf(nodeId: string): readonly ClipLane[] {
    return this.players.get(nodeId)?.lanes ?? []
  }

  /** What the model's own file spells, which is the list a panel offers a choice from. */
  fileNamesOf(nodeId: string): readonly string[] {
    return this.players.get(nodeId)?.fileNames ?? []
  }

  remove(nodeId: string): void {
    const player = this.players.get(nodeId)
    if (!player) return

    // Both, and in this order: `stopAllAction` leaves the actions cached, and a mixer holding
    // them keeps every bone of a released model alive with it.
    player.mixer.stopAllAction()
    player.mixer.uncacheRoot(player.mixer.getRoot())
    this.players.delete(nodeId)
  }

  clear(): void {
    for (const nodeId of [...this.players.keys()]) this.remove(nodeId)
  }

  has(nodeId: string): boolean {
    return this.players.has(nodeId)
  }

  /** What a node's file brought, for whoever has to say again what that model IS. */
  clipsOf(nodeId: string): AnimationClip[] {
    const player = this.players.get(nodeId)
    if (!player) return []

    // Its OWN, never what was retargeted onto it: a rig describes the file, and an animation
    // dropped on a character says nothing about the character.
    return [...player.fileClips]
  }

  /**
   * What the band drives, which is what an `auto` block yields to. Held here rather than passed
   * at each call: keying a trajectory changes no model node, so nothing else would tell these
   * blocks to stop travelling on their own.
   */
  setTimeline(timeline: AnimationTimeline): void {
    if (timeline === this.timeline) return

    this.timeline = timeline
    for (const [nodeId, player] of this.players) this.apply(nodeId, player.lanes)
  }

  /**
   * Makes a node play the blocks the document holds, lane by lane. No lane at all puts the model
   * back to its rest pose: with no action driving them, three restores the values the file was
   * loaded with.
   */
  apply(nodeId: string, lanes: readonly ClipLane[]): void {
    const player = this.players.get(nodeId)
    if (!player) return

    player.lanes = lanes
    // 🛑 Remembered while a machine drives it: the lanes are what `release` gives the body back to,
    // and a document edited mid-game must not repose a model the game is playing.
    if (player.graphDriven) return
    const onBand = nodeTravelsOnBand(this.timeline, nodeId)
    const kept = new Set<string>()

    for (const ref of lanes.flatMap(lane => lane.clips)) {
      if (this.bindClip(player, ref, onBand)) kept.add(ref.id)
    }

    for (const [id, held] of player.bound) {
      if (kept.has(id)) continue

      player.mixer.uncacheClip(held.clip)
      player.bound.delete(id)
    }

    this.place(player)
  }

  /**
   * Puts every block where the scene's HEAD says, rather than where real time left it. A render
   * never advances real time at all: without this it writes the same pose a thousand times, and
   * a film of a walking character came out frozen for exactly that reason.
   *
   * Answers whether any model was actually POSED: a head that drives nothing moves nothing, and
   * an exported frame reads that to decide whether it owes a shadow pass.
   */
  seek(playhead: Us): boolean {
    this.playhead = playhead
    return this.placeAll()
  }

  /**
   * Poses one model from a clock of its OWN, so a block can be watched without the scene's head
   * moving. `seconds` counts from the moment watching began; `null` gives the model back to the
   * head. Answers how long the clip runs, so a caller knows when one pass is over.
   */
  preview(nodeId: string, clipId: string | null, seconds: number): number {
    const player = this.players.get(nodeId)
    if (!player) return 0

    const held = clipId === null ? undefined : player.bound.get(clipId)
    if (!held) {
      this.place(player)
      return 0
    }

    const length = player.lengths[held.key] ?? 0
    const into = seconds * held.ref.speed + held.ref.offset
    const time = held.ref.loop ? (length > 0 ? into % length : 0) : Math.min(into, length)

    for (const [id, other] of player.bound) {
      const action = player.mixer.clipAction(other.clip)
      action.loop = other.ref.loop ? LoopRepeat : LoopOnce
      action.play()
      action.paused = true
      // The watched block alone drives the model: the others would blend their own pose into it.
      action.enabled = id === clipId
      action.weight = id === clipId ? 1 : 0
      if (id === clipId) action.time = time
    }

    player.mixer.update(0)
    return length
  }

  /** What a state machine plays on this model, in place of its band — see `posePlayer`. */
  pose(nodeId: string, clips: readonly PosedClip[]): void {
    const player = this.players.get(nodeId)
    if (player) posePlayer(player, clips)
  }

  /** Gives a model back to its band. Idempotent, and what `world.dispose` owes every body. */
  release(nodeId: string): void {
    const player = this.players.get(nodeId)
    if (!player || !player.graphDriven) return

    releasePlayer(player)
    this.apply(nodeId, player.lanes)
  }

  private placeAll(): boolean {
    let posed = false
    for (const player of this.players.values()) {
      if (player.bound.size === 0 || player.graphDriven) continue
      this.place(player)
      posed = true
    }
    return posed
  }

  private place(player: Player): void {
    if (player.graphDriven) return

    const sounding = new Map<string, ClipWeight>()
    for (const heard of clipBlendAt(player.lanes, player.lengths, this.playhead)) {
      sounding.set(heard.clipId, heard)
    }
    for (const [id, held] of player.bound) {
      const action = player.mixer.clipAction(held.clip)
      action.loop = held.ref.loop ? LoopRepeat : LoopOnce
      action.play()

      // Paused, every one of them: the head is the only clock, and the time below is written
      // straight in rather than reached by letting the mixer run to it.
      const heard = sounding.get(id)
      action.paused = true
      action.enabled = heard !== undefined
      action.weight = heard?.weight ?? 0
      if (heard) action.time = heard.time
    }

    // A pose has to show without waiting for a frame, and nothing here ever gets one.
    player.mixer.update(0)
  }

  private bindClip(player: Player, ref: ClipRef, onBand: boolean): boolean {
    const key = clipKeyOf(ref.source)
    const source = player.clips.get(key)
    if (!source) return false
    const travel = travelsWith(ref.rootMotion, onBand)
    const part = ref.part ?? WHOLE_BODY
    const held = player.bound.get(ref.id)
    if (held && held.travel === travel && held.key === key && held.part === part) {
      held.ref = ref
      return true
    }
    if (held) player.mixer.uncacheClip(held.clip)
    const clip = blockClip(
      source,
      player.rootTracks.get(key) ?? null,
      travel,
      drivenIn(player, part),
    )
    player.bound.set(ref.id, { ref, travel, key, part, clip })
    return true
  }
}
