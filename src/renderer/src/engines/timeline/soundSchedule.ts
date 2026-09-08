import { secondsToUs, usToSeconds } from '@shared/domain/time'
import { fromDb } from '../audio/audioData'
import { createRefCache } from '../core/refCache'
import { audioChunksIn, fadeAt, type AudioChunk } from './audio'
import {
  EMPTY_SEQUENCE,
  playsThrough,
  SECOND,
  sequenceDuration,
  trackById,
  type SequenceState,
  type Us,
} from './timelineState'

/** One corner of the slice's envelope: the level to reach, and when to have reached it. */
type SoundRamp = {
  /** On the output clock, like `SoundCue.when` — never a timeline microsecond. */
  when: number
  /** Linear amplitude, the clip's own gain already folded in. */
  level: number
}

/** What one planned slice asks of the output, in the output's own seconds. */
export type SoundCue = {
  /** On the output clock, not on the timeline. */
  when: number
  /** Where to start reading inside the source. */
  offset: number
  /** How much source to read — it lasts that divided by `rate`. */
  duration: number
  rate: number
  /** Linear amplitude **at** `when`: the decibels are converted here, never at the output. */
  gain: number
  /**
   * Where the envelope goes next, empty for a slice that holds one level throughout.
   *
   * Empty rather than a first point equal to `gain`: a non-empty array would carry an element no
   * caller may drop, and a branch no test can reach.
   */
  ramps: readonly SoundRamp[]
}

type PlayingSound = { stop: () => void }

/** A sound in memory, ready to be started. */
export type LoadedSound = (cue: SoundCue) => PlayingSound

// What the window can do and jsdom cannot starts here: read over the scheme, decode samples, put
// them on an output clock. Everything above is arithmetic, and the arithmetic is where the bugs
// are — a sound planned a frame late is heard, a picture painted a frame late is not.

/**
 * A listening point on the output, for the surfaces that draw what is being heard.
 *
 * Deliberately not an `AnalyserNode`: what a meter and a spectrum need of one is these three
 * members, and a port that handed the node over would drag Web Audio into every test that draws.
 * Both readers hand back a buffer they own and refill — copy it if you mean to keep it.
 */
export type AudioTap = {
  /** Where the signal stands right now, sample by sample, between −1 and 1. */
  levels: () => Float32Array
  /** The same instant by frequency, 0 to 255 a bin, spread from nothing to half the rate. */
  frequencies: () => Uint8Array
  sampleRate: number
}

export type SoundPort = {
  /**
   * Seconds on the output's own clock, or `null` while it is not running.
   *
   * A suspended output does not advance its clock: anchoring on it would peg the sequence to an
   * instant that never moves, and the same answer feeds the engine's clock.
   */
  now: () => number | null
  /** Where to listen to what is going out, or null while nothing has opened an output yet. */
  tap: () => AudioTap | null
  /** An output built before any gesture starts suspended, and every cue lands in silence. */
  resume: () => void
  load: (assetId: string) => Promise<LoadedSound>
}

/**
 * Where a chunk lands on the output clock, or nothing when it is already over.
 *
 * A slice is planned before its sound is loaded, and decoding a minute of music takes long
 * enough to miss its own start. What is late is *skipped* rather than played late: playing it
 * late would hold the sound behind the picture for the whole clip, and a lip sync off by a
 * tenth of a second is the one thing an editor hears immediately.
 */
export function cueFor(chunk: AudioChunk, origin: number, now: number): SoundCue | null {
  const due = origin + usToSeconds(chunk.at)
  const late = Math.max(0, now - due)
  // Both in source seconds: a clip at twice the rate spends two seconds of source per second.
  const offset = usToSeconds(chunk.sourceStart) + late * chunk.speed
  const duration = (usToSeconds(chunk.duration) - late) * chunk.speed

  if (duration <= 0) return null

  const when = due + late
  // The instant the slice really begins, which is what the envelope is read at — a clip whose
  // load ran past its own fade-in must come in part-way up rather than from silence.
  const begins = chunk.at + secondsToUs(late)
  const peak = fromDb(chunk.gain)

  return {
    when,
    offset,
    duration,
    rate: chunk.speed,
    gain: peak * fadeAt(chunk.fade, begins),
    ramps: rampsFor(chunk, begins, peak, when),
  }
}

/**
 * The envelope's corners after the slice's start, in the output's seconds.
 *
 * `speed` plays no part: the timeline and the output clock run 1:1, and a rate only changes how
 * fast the source is consumed between two instants that stay where they are.
 */
function rampsFor(chunk: AudioChunk, begins: Us, peak: number, when: number): SoundRamp[] {
  const ends = chunk.at + chunk.duration
  const levelAt = (moment: Us): number => peak * fadeAt(chunk.fade, moment)

  // Already in order: `clampFades` holds the rise before the fall, and a corner past the slice's
  // own end is dropped. Only the duplicates are left to drop — an unramped edge sits on the end.
  const corners = [chunk.fade.risenAt, chunk.fade.fallsFrom, ends]
    .filter(moment => moment > begins && moment <= ends)
    .filter((moment, index, all) => index === 0 || moment !== all[index - 1])

  // A trailing corner at the level already held says nothing. A leading one may: it holds the
  // plateau a fall starts from, and dropping it would ramp down from the slice's first instant.
  const levels = [levelAt(begins), ...corners.map(levelAt)]
  let kept = 0
  levels.forEach((level, index) => {
    if (index > 0 && level !== levels[index - 1]) kept = index
  })

  return corners.slice(0, kept).map(moment => ({
    when: when + usToSeconds(moment - begins),
    level: levelAt(moment),
  }))
}

/**
 * How far ahead a clip is planned. It is the time a load has to fetch and decode before its own
 * start, and the amount of sound that has to be silenced when the transport stops — a second
 * covers a take of music on a warm disk without holding the whole sequence in memory.
 */
export const SOUND_HORIZON: Us = SECOND

/**
 * How often the sequence is looked at. The horizon leaves a second of slack, so reading it on
 * every frame would build a chunk per audio clip sixty times a second to plan the same nothing.
 */
const PLAN_STEP: Us = SECOND / 5

export type SoundSchedulerDeps = {
  port: SoundPort
  /** How far ahead of the playhead a clip is planned — the time a load has to arrive. */
  horizon: Us
}

export type SoundScheduler = {
  apply: (state: SequenceState) => void
  /** Anchors the timeline on the output clock, then plans what is already due. */
  start: (time: Us) => void
  /** Plans whatever entered the horizon and forgets what has finished. */
  pump: (time: Us) => void
  stop: () => void
}

/** A clip in flight: what it holds, where it ends, and what silences it. */
type Scheduled = { trackId: string; assetId: string; until: Us; stop: () => void }

/**
 * Plays what the sequence says, one source per clip.
 *
 * A clip is planned **whole**, once, as it enters the horizon — not sliced window by window,
 * which would restart a source at every joint and be heard as a click. The samples themselves
 * are shared and reference counted by asset: `decodeAudioData` decodes the *file*, not the
 * clip's share of it, so the same jingle laid thirty times must not be decoded thirty times.
 */
export function createSoundScheduler({ port, horizon }: SoundSchedulerDeps): SoundScheduler {
  let state: SequenceState = EMPTY_SEQUENCE
  /** The output time the sequence's zero sits at, or null until the output starts running. */
  let origin: number | null = null
  /** Whether the transport is running — distinct from `origin`, which waits for the output. */
  let started = false
  /** The last playhead the sequence was read at, so it is not read again on the next frame. */
  let plannedAt: Us | null = null
  const playing = new Map<string, Scheduled>()
  /**
   * Assets the output could not read. Remembered rather than retried: a clip whose media moved
   * would otherwise be fetched and decoded again on every frame it stays under the playhead,
   * which is the very stutter `decoder-pool` remembers failures to avoid.
   */
  const unplayable = new Set<string>()

  const sounds = createRefCache<LoadedSound>({
    load: port.load,
    // Nothing to free by hand: a loaded sound is a closure over decoded samples, and letting
    // the last reference go is what releases them.
    free: () => {},
    onFailure: assetId => unplayable.add(assetId),
  })

  const drop = (clipId: string, entry: Scheduled): void => {
    playing.delete(clipId)
    sounds.release(entry.assetId)
  }

  const schedule = (chunk: AudioChunk, anchor: number): void => {
    const entry: Scheduled = {
      trackId: chunk.trackId,
      assetId: chunk.assetId,
      until: chunk.at + chunk.duration,
      stop: () => {},
    }
    playing.set(chunk.clipId, entry)

    void sounds.acquire(chunk.assetId).then(sound => {
      // This entry, not this clip. A stop drops it, and a track muted then unmuted while the
      // load was in flight holds a *second* entry under the same clip — starting this one over
      // it would play the clip twice, with only the newer one stoppable. Whoever drops an entry
      // releases its sound, so this path never does.
      if (playing.get(chunk.clipId) !== entry) return
      if (!sound) return drop(chunk.clipId, entry)

      const now = port.now()
      const cue = now === null ? null : cueFor(chunk, anchor, now)
      // A slice whose start went by while it loaded stays in the map, silent: dropped, the
      // frame loop would plan it again, and again, for as long as the clip lasts.
      if (cue) entry.stop = sound(cue).stop
    })
  }

  const pump = (time: Us): void => {
    if (!started) return

    const now = port.now()
    // The output wakes a beat after it is asked to: until it does, its clock says nothing and
    // there is no instant to hang the sequence on.
    if (now === null) return
    origin ??= now - usToSeconds(time)
    const anchor = origin

    if (plannedAt !== null && time >= plannedAt && time - plannedAt < PLAN_STEP) return
    plannedAt = time

    // Kept a horizon past its end rather than dropped on the beat: the source runs out on the
    // output clock and the playhead on the engine's, and an entry let go of while its source
    // still sounds is a sound `stop` can no longer reach.
    for (const [clipId, entry] of playing) if (entry.until + horizon <= time) drop(clipId, entry)

    const horizonEnd = time + horizon
    // Asked to the end of the sequence rather than to the horizon: the horizon says which clips
    // to plan, the clip itself says how long it sounds, and a window would cut it short.
    for (const chunk of audioChunksIn(state, time, sequenceDuration(state))) {
      if (chunk.at >= horizonEnd) continue
      if (playing.has(chunk.clipId) || unplayable.has(chunk.assetId)) continue
      schedule(chunk, anchor)
    }
  }

  return {
    apply: next => {
      state = next
      // Two edits are heard at once, because they say so: muting a track, and taking a clip
      // away. Everything else — a trim, a gain, a speed, a fade — reaches the next clip planned rather
      // than the one already sounding, which is what keeps a drag from restarting a source on
      // every pointer move.
      for (const [clipId, entry] of playing) {
        const track = trackById(next, entry.trackId)
        const audible =
          track && playsThrough(next, track) && track.clips.some(clip => clip.id === clipId)
        if (audible) continue

        entry.stop()
        drop(clipId, entry)
      }
    },

    start: time => {
      started = true
      port.resume()
      pump(time)
    },

    pump,

    stop: () => {
      started = false
      origin = null
      plannedAt = null
      for (const [clipId, entry] of [...playing]) {
        entry.stop()
        drop(clipId, entry)
      }
    },
  }
}
