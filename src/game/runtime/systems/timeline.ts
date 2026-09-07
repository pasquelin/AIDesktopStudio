// SPDX-License-Identifier: MIT

import type { AnimationTimeline, TimelineMedia, TimelineTransition } from '@shared/domain/animation'
import type { Ref } from '@shared/domain/ref'
import type { AudioVoice } from '../../ports/audioPort'
import { clamp } from '../../numeric'
import { sayCustom } from '../sayCustom'
import type { System, World } from '../world'

export type TimelineSystemOptions = {
  /** The scene's own timeline. Absent rows play nothing — a scene that carries none is silent. */
  timeline: AnimationTimeline
  /** How the host spells an asset of the catalogue — the studio's reference, or an export's. */
  assetRef: (assetId: string) => Ref
}

/**
 * What a timeline DOES while a game runs: its events on the bus, its sounds, its veil, and the
 * scene a transition goes to.
 *
 * 🛑 NOT played here, and read back all the same: `video`, which no port offers a surface for.
 * A sound's fades ARE computed — see `levelOf` — but no `AudioPort` implements a voice to hear
 * them on.
 */
export function createTimelineSystem(options: TimelineSystemOptions): System {
  // Resolved ONCE: a `?? []` in a fixed update is a fresh array sixty times a second, for every
  // scene written before this lot — which is all of them.
  const events = options.timeline.events ?? []
  const audio = options.timeline.audio ?? []
  const rows = options.timeline.transitions ?? []
  const transitions = rows.filter(playable)
  // 🛑 A separate list, and a CUT belongs to it: a cut veils nothing and still changes scene.
  const changes = rows.filter(changesScene)
  const fired = new Set<string>()
  // 🛑 Its own set: an event row and a transition sharing an id would cancel each other out.
  const swapped = new Set<string>()
  const playing = new Map<string, AudioVoice>()
  // 🛑 The level last written, per row: a loop with no fade would otherwise cross the port sixty
  // times a second for a number that never moves.
  const level = new Map<string, number>()
  // 🛑 ONE attempt per row, never cleared: without it the port was asked again on every fixed
  // step of the row's whole length. The price is declared — a host refusing a voice TRANSIENTLY
  // mutes that row for good, where the storm would have retried.
  const voiceless = new Set<string>()

  const fireEvents = (world: World, now: number): void => {
    for (const event of events) {
      if (!Number.isFinite(event.at) || event.at > now || fired.has(event.id)) continue
      fired.add(event.id)
      sayCustom(world, event.name, event.entity, event.payload)
    }
  }

  const playAudio = (world: World, now: number): void => {
    for (const sound of audio) {
      const on = within(sound, now)
      if (on && !playing.has(sound.id) && !voiceless.has(sound.id)) {
        const opening = levelOf(sound, now)
        const voice = world.ports.audio.play(options.assetRef(sound.assetId), {
          volume: opening,
          loop: sound.loop === true,
        })
        if (voice) {
          playing.set(sound.id, voice)
          level.set(sound.id, opening)
        } else voiceless.add(sound.id)
      } else if (on) updateLevel(sound, now, playing, level)
      else stopSound(sound.id, playing, level)
    }
  }

  const changeScene = (world: World, now: number): void => {
    for (const transition of changes) {
      if (swapped.has(transition.id)) continue
      const half = halfOf(transition)
      if (now < transition.at + half) continue
      swapped.add(transition.id)
      world.ports.scenes.load(transition.scene, half / MICROSECONDS_A_SECOND)
    }
  }

  return {
    name: 'timeline',
    reads: [],
    writes: [],

    fixedUpdate: (world: World) => {
      // 🛑 The world's clock, never one of its own: a timeline that counted separately would
      // drift from the physics at the first late frame. It also never goes backwards — a STOP
      // builds a new world and a new system — so nothing here has to be undone.
      const now = world.time.elapsed * MICROSECONDS_A_SECOND
      fireEvents(world, now)
      playAudio(world, now)
      world.ports.render.veil(veilAt(transitions, now))
      changeScene(world, now)
    },

    // 🛑 The voices this row started: the mixer outlives a scene swap, and a loop left playing
    // would go on under the next scene until the window closed.
    dispose: () => {
      for (const voice of playing.values()) voice.stop()
      playing.clear()
      level.clear()
      voiceless.clear()
    },
  }
}

function updateLevel(
  sound: TimelineMedia,
  now: number,
  playing: Map<string, AudioVoice>,
  level: Map<string, number>,
): void {
  const wanted = levelOf(sound, now)
  if (level.get(sound.id) === wanted) return
  playing.get(sound.id)?.gain(wanted)
  level.set(sound.id, wanted)
}

function stopSound(id: string, playing: Map<string, AudioVoice>, level: Map<string, number>): void {
  if (!playing.has(id)) return
  playing.get(id)?.stop()
  playing.delete(id)
  level.delete(id)
}

/** A timeline counts in microseconds; the world counts seconds. */
const MICROSECONDS_A_SECOND = 1_000_000

const within = (media: TimelineMedia, now: number): boolean =>
  now >= media.start && now < media.start + media.duration

/** A `cut` is a change, not a fade: it veils nothing. An instant that is not one veils nothing. */
const playable = (transition: TimelineTransition): boolean =>
  transition.kind !== 'cut' &&
  Number.isFinite(transition.at) &&
  Number.isFinite(transition.duration) &&
  transition.duration > 0

/** A row that goes somewhere. A `cut` does too, at once. */
const changesScene = (
  transition: TimelineTransition,
): transition is TimelineTransition & { scene: string } =>
  transition.scene !== undefined &&
  transition.scene.length > 0 &&
  Number.isFinite(transition.at) &&
  // A length that is not one would put the swap BEFORE the row's own instant.
  (transition.kind === 'cut' || (Number.isFinite(transition.duration) && transition.duration > 0))

/** Half a fade, which is where the veil is full. A cut has none, and swaps on its instant. */
const halfOf = (transition: TimelineTransition): number =>
  transition.kind === 'cut' ? 0 : transition.duration / 2

/**
 * How loud a row is at that instant — its own gain, taken down by whichever fade it is inside.
 *
 * 🛑 The two were declared and read by nobody: a row saved with a one-second fade came out full
 * from the first sample. The shorter of the two wins where they overlap, as a mixer does.
 */
function levelOf(sound: TimelineMedia, now: number): number {
  const gain = Number.isFinite(sound.gain) ? clamp(sound.gain ?? 1, 0, 1) : 1
  const since = now - sound.start
  const until = sound.start + sound.duration - now

  return gain * Math.min(rampOf(since, sound.fadeIn), rampOf(until, sound.fadeOut))
}

/** A ramp in `[0, 1]`: full when there is no fade to speak of, or once it is through. */
const rampOf = (elapsed: number, over: number | undefined): number =>
  over === undefined || !Number.isFinite(over) || over <= 0 ? 1 : Math.min(elapsed / over, 1)

/**
 * 🛑 ONE transition at a time — the LAST of the list that is running.
 *
 * The same rule a montage settles an overlap by, and the one `activeShotAt` already applies to
 * the camera shots: the line drawn highest wins, read off the order of the list. Combining two
 * that overlap made the picture go dark, open back up between them, and go dark again.
 */
function veilAt(transitions: readonly TimelineTransition[], now: number): number {
  for (let at = transitions.length - 1; at >= 0; at--) {
    const transition = transitions[at]
    if (!transition) continue

    const through = (now - transition.at) / transition.duration
    if (through < 0 || through > 1) continue
    // Full at its halfway mark, back down after: one row is one whole transition.
    return through <= 0.5 ? through * 2 : (1 - through) * 2
  }
  return 0
}
