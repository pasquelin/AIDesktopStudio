import { clamp } from '@shared/numeric'
import type { Us } from '@/engines/timeline/timelineState'

/**
 * Sound as plain data: the samples, and nothing that only a browser can hold.
 *
 * Deliberately not an `AudioBuffer`. Every rule worth testing — where a fade lands, what a
 * silence is, how much a take has to be lowered — is arithmetic on these arrays, and jsdom has
 * no `AudioContext` to build one with. The conversion to and from `AudioBuffer` happens at the
 * edge, where the browser is.
 */
export type AudioData = {
  sampleRate: number
  /** One array per channel, all the same length, samples in -1..1. */
  channels: Float32Array[]
}

export function frameCount(data: AudioData): number {
  return data.channels[0]?.length ?? 0
}

export function durationOf(data: AudioData): Us {
  return Math.round((frameCount(data) / data.sampleRate) * 1_000_000)
}

export function framesFor(time: Us, sampleRate: number): number {
  return Math.max(0, Math.round((time / 1_000_000) * sampleRate))
}

function mapChannels(data: AudioData, change: (channel: Float32Array) => Float32Array): AudioData {
  return { sampleRate: data.sampleRate, channels: data.channels.map(change) }
}

/** Keeps `[from, to)`, clamped to what there is. An empty range yields silence, never a throw. */
export function crop(data: AudioData, from: Us, to: Us): AudioData {
  const total = frameCount(data)
  const start = Math.min(total, framesFor(from, data.sampleRate))
  const end = clamp(framesFor(to, data.sampleRate), start, total)

  return mapChannels(data, channel => channel.slice(start, end))
}

/**
 * Linear ramps at both ends, in place of the source. Linear rather than equal-power: this is
 * one take fading to silence, not two takes crossing.
 */
export function applyFades(data: AudioData, fadeIn: Us, fadeOut: Us): AudioData {
  const total = frameCount(data)
  const rise = Math.min(total, framesFor(fadeIn, data.sampleRate))
  const fall = Math.min(total - rise, framesFor(fadeOut, data.sampleRate))
  if (rise === 0 && fall === 0) return data

  return mapChannels(data, channel => {
    // `slice` memcpys; `Float32Array.from` walks the iterator protocol one sample at a time,
    // which on eight million samples is the whole cost of the chain.
    const faded = channel.slice()
    for (let frame = 0; frame < rise; frame++) faded[frame] = (faded[frame] ?? 0) * (frame / rise)
    for (let frame = 0; frame < fall; frame++) {
      const index = total - 1 - frame
      faded[index] = (faded[index] ?? 0) * (frame / fall)
    }
    return faded
  })
}

/** Decibels as a linear amplitude — what every gain, threshold and output actually multiplies by. */
export function fromDb(db: number): number {
  return 10 ** (db / 20)
}

export function applyGain(data: AudioData, db: number): AudioData {
  if (db === 0) return data
  const factor = fromDb(db)

  return mapChannels(data, channel => {
    const scaled = channel.slice()
    for (let frame = 0; frame < scaled.length; frame++) {
      // Clamped: past ±1 the samples wrap on the way out, which is heard as a crackle rather
      // than as loudness.
      scaled[frame] = clamp((scaled[frame] ?? 0) * factor, -1, 1)
    }
    return scaled
  })
}

/** Root mean square across every channel, as a linear amplitude. */
export function rms(data: AudioData): number {
  const total = frameCount(data)
  if (total === 0 || data.channels.length === 0) return 0

  let sum = 0
  for (const channel of data.channels) {
    for (const sample of channel) sum += sample * sample
  }
  return Math.sqrt(sum / (total * data.channels.length))
}

export function toDb(amplitude: number): number {
  return amplitude > 0 ? 20 * Math.log10(amplitude) : -Infinity
}

/** What a streaming platform asks for, and what generated music is rarely delivered at. */
export const DEFAULT_TARGET_LUFS = -14

/**
 * Brings the take to a target loudness.
 *
 * Measured as RMS rather than as gated ITU-R BS.1770 loudness: the gating, the K-weighting
 * filter and the short-term windows are a signal-processing project of their own, and on a
 * generated track — one texture, no dialogue, no silence to gate out — the two agree closely
 * enough to be worth the difference in code.
 */
export function normalize(data: AudioData, targetLufs = DEFAULT_TARGET_LUFS): AudioData {
  const level = toDb(rms(data))
  if (!Number.isFinite(level)) return data
  return applyGain(data, targetLufs - level)
}

/**
 * Decoded samples folded into the min/max pairs a strip draws from — the same shape, and the
 * same cadence, as the file ffmpeg writes at ingest.
 *
 * Written here so a montage can draw a take the ingest never derived one for: an asset that came
 * down from the API before ffmpeg was available, or a build with no ffmpeg to reach at all. The
 * browser decodes the file either way — that is how the take editor draws its own waveform — so
 * the pairs are one walk over samples already in memory rather than a second decode.
 *
 * Channels are folded together, because what a clip draws is what the output sums.
 */
export function peaksFromSamples(data: AudioData, perSecond: number): Float32Array {
  const total = frameCount(data)
  const width = Math.max(1, Math.round(data.sampleRate / perSecond))
  const buckets = Math.ceil(total / width)
  const peaks = new Float32Array(buckets * 2)

  for (let bucket = 0; bucket < buckets; bucket++) {
    const from = bucket * width
    const to = Math.min(total, from + width)

    let min = 0
    let max = 0
    for (const channel of data.channels) {
      for (let frame = from; frame < to; frame++) {
        const sample = channel[frame] ?? 0
        if (sample < min) min = sample
        if (sample > max) max = sample
      }
    }

    peaks[bucket * 2] = min
    peaks[bucket * 2 + 1] = max
  }

  return peaks
}

export type SilenceRange = { from: Us; to: Us }

/** Anything below this is silence, unless the caller says otherwise. */
const DEFAULT_SILENCE_DB = -50
/** Shorter gaps are breath and rhythm, not silence to remove. */
const DEFAULT_MIN_SILENCE: Us = 400_000

/**
 * The quiet stretches at the two ends. Only the ends: cutting a gap out of the middle of a
 * generated take shortens it against the beat, which is heard immediately.
 */
export function edgeSilences(
  data: AudioData,
  thresholdDb = DEFAULT_SILENCE_DB,
  minLength: Us = DEFAULT_MIN_SILENCE,
): SilenceRange[] {
  const total = frameCount(data)
  if (total === 0) return []

  const floor = fromDb(thresholdDb)
  const loud = (frame: number): boolean =>
    data.channels.some(channel => Math.abs(channel[frame] ?? 0) > floor)

  let head = 0
  while (head < total && !loud(head)) head++
  let tail = total
  while (tail > head && !loud(tail - 1)) tail--

  const asTime = (frame: number): Us => Math.round((frame / data.sampleRate) * 1_000_000)
  const ranges: SilenceRange[] = []
  if (asTime(head) >= minLength) ranges.push({ from: 0, to: asTime(head) })
  if (asTime(total - tail) >= minLength) ranges.push({ from: asTime(tail), to: asTime(total) })

  return ranges
}

/**
 * What is left of a take once its leading and trailing silence is dropped — the bounds, not the
 * samples.
 *
 * Bounds rather than a cropped take, because two callers need two different things from the same
 * decision: the chain wants the samples, and the montage clip under it wants where they came
 * from in the source. Deriving one from the other twice is how the two come to disagree.
 */
export function silentBounds(
  data: AudioData,
  thresholdDb = DEFAULT_SILENCE_DB,
  minLength: Us = DEFAULT_MIN_SILENCE,
): { head: Us; tail: Us } {
  const silences = edgeSilences(data, thresholdDb, minLength)

  return {
    head: silences.find(range => range.from === 0)?.to ?? 0,
    tail: silences.find(range => range.from > 0)?.from ?? durationOf(data),
  }
}
