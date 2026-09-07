import { fromDb, framesFor, type AudioData } from '../audio/audioData'
import { audioChunksIn, fadeAt, type AudioChunk } from './audio'
import { playsThrough, sequenceDuration, type SequenceState } from './timelineState'

/**
 * The montage's sound, mixed down without an output device.
 *
 * A port for the samples rather than a decoder here: `decodeAudioData` is the browser's, jsdom
 * has none, and every rule worth testing — where a clip lands, how loud, through which ramp —
 * is arithmetic on plain arrays.
 */

/** One asset's samples, however the window decoded them. `null` for a rush that would not open. */
export type StemSource = (assetId: string) => Promise<AudioData | null>

/** One track, mixed. The name is the track's, which is what the file is called. */
export type Stem = { trackId: string; name: string; data: AudioData }

export type StemsOptions = {
  /** Raised once per clip mixed, so a montage of two hundred rushes reports rather than freezes. */
  onStep?: (done: number, total: number) => void
  signal?: AbortSignal
}

/**
 * One sample, read between two. Linear rather than nearest: a clip at any speed but 1, or a rush
 * recorded at 44 100 in a 48 000 sequence, otherwise arrives with the buzz of a stepped read.
 */
function sampleAt(channel: Float32Array, position: number): number {
  if (position < 0) return 0
  // SILENCE past the end, not the last sample held: a clip whose timeline duration outruns its
  // rush would otherwise sit on a DC level for the remainder, where playback plays nothing.
  const before = Math.floor(position)
  if (before + 1 >= channel.length) return 0

  const after = (channel[before + 1] ?? 0) - (channel[before] ?? 0)
  return (channel[before] ?? 0) + after * (position - before)
}

/**
 * Back to the window for one turn. A macrotask and not a microtask: a resolved promise drains
 * without ever letting the browser paint or read a click, which is the whole point of stopping.
 */
const yieldToWindow = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

/** The channel a mono rush feeds into a stereo stem: its only one, into both. */
const sourceChannel = (source: AudioData, channel: number): Float32Array =>
  source.channels[Math.min(channel, source.channels.length - 1)] ?? new Float32Array(0)

/**
 * One clip summed into the stem it belongs to.
 *
 * The envelope is read per SAMPLE off `fadeAt` — the very function the scheduler plays through
 * and the painter draws — so what a stem sounds like cannot drift from what the strip showed.
 */
function mixChunk(
  into: Float32Array[],
  sampleRate: number,
  chunk: AudioChunk,
  source: AudioData,
): void {
  const peak = fromDb(chunk.gain)
  const at = framesFor(chunk.at, sampleRate)
  const frames = framesFor(chunk.duration, sampleRate)
  // How far the read head walks through the source per output frame: a clip's own speed, and the
  // ratio between the two rates. A 44 100 rush in a 48 000 sequence is the ordinary case.
  const step = chunk.speed * (source.sampleRate / sampleRate)
  const from = (chunk.sourceStart / 1_000_000) * source.sampleRate

  for (let channel = 0; channel < into.length; channel += 1) {
    const stem = into[channel]
    const read = sourceChannel(source, channel)
    if (!stem || read.length === 0) continue

    for (let frame = 0; frame < frames; frame += 1) {
      const lands = at + frame
      if (lands >= stem.length) break

      const moment = chunk.at + Math.round((frame / sampleRate) * 1_000_000)
      stem[lands] =
        (stem[lands] ?? 0) + sampleAt(read, from + frame * step) * peak * fadeAt(chunk.fade, moment)
    }
  }
}

/**
 * What a stem set would weigh, at most, before a single sample is mixed — stereo assumed for
 * every audible track, which is the widest any of them can come out.
 *
 * Answered UP FRONT because the alternative is minutes of mixing followed by a refusal: 16-bit
 * stereo at 48 kHz is 192 KB a second, so the ceiling is reached by a montage that fits on screen.
 */
export function stemsWeight(state: SequenceState): number {
  const audible = state.tracks.filter(
    track => track.kind === 'audio' && playsThrough(state, track),
  ).length

  return audible * framesFor(sequenceDuration(state), state.settings.sampleRate) * 2 * 2
}

/**
 * A `.wav` worth of samples per audible track, at the sequence's own rate.
 *
 * Muted and un-soloed tracks are absent rather than silent, `playsThrough` deciding it — the same
 * answer the scheduler gives, so a stem set holds what the montage plays and nothing else.
 */
export async function stemsOf(
  state: SequenceState,
  decode: StemSource,
  { onStep, signal }: StemsOptions = {},
): Promise<Stem[]> {
  signal?.throwIfAborted()

  const { sampleRate } = state.settings
  const frames = framesFor(sequenceDuration(state), sampleRate)
  const chunks = audioChunksIn(state, 0, sequenceDuration(state))

  const sources = new Map<string, AudioData | null>()
  const stems: Stem[] = []
  let done = 0

  for (const track of state.tracks) {
    if (track.kind !== 'audio' || !playsThrough(state, track)) continue

    const mine = chunks.filter(chunk => chunk.trackId === track.id)
    if (mine.length === 0) continue

    for (const chunk of mine) {
      signal?.throwIfAborted()
      if (!sources.has(chunk.assetId)) sources.set(chunk.assetId, await decode(chunk.assetId))
    }

    // Preserve stereo as soon as one clip has two channels.
    const widest = mine.reduce(
      (most, chunk) => Math.max(most, sources.get(chunk.assetId)?.channels.length ?? 0),
      1,
    )

    const channels = Array.from({ length: widest }, () => new Float32Array(frames))
    for (const chunk of mine) {
      // Yield between clips so cancellation and progress remain responsive.
      await yieldToWindow()
      signal?.throwIfAborted()

      const source = sources.get(chunk.assetId)
      if (source) mixChunk(channels, sampleRate, chunk, source)
      done += 1
      onStep?.(done, chunks.length)
    }

    stems.push({ trackId: track.id, name: track.name, data: { sampleRate, channels } })
  }

  return stems
}
