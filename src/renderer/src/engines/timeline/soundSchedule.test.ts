import { describe, expect, it } from 'vitest'
import { cueFor } from './soundSchedule'
import { audioChunksIn, type AudioChunk, type ClipFade } from './audio'
import { clipFixture, sequenceWith, trackFixture } from './timeline-fixtures'
import type { Clip, SequenceState } from './timelineState'

const chunk = (over: Partial<AudioChunk> = {}): AudioChunk => {
  // The default envelope follows the slice, so moving one in a case never leaves a fade behind it.
  const at = over.at ?? 0
  const duration = over.duration ?? 2_000_000

  return {
    trackId: 'A1',
    clipId: 'a',
    assetId: 'asset-a',
    at,
    sourceStart: 0,
    duration,
    speed: 1,
    gain: 0,
    fade: { from: at, to: at + duration, risenAt: at, fallsFrom: at + duration },
    ...over,
  }
}

/** A two-second slice at zero, ramped as asked. */
const ramped = (fade: Partial<ClipFade>, over: Partial<AudioChunk> = {}): AudioChunk =>
  chunk({ ...over, fade: { from: 0, to: 2_000_000, risenAt: 0, fallsFrom: 2_000_000, ...fade } })

const clip = (id: string, start: number, duration: number, extra: Partial<Clip> = {}): Clip =>
  clipFixture(id, start, duration, extra)

const withAudio = (clips: Clip[], extra = {}): SequenceState =>
  sequenceWith([trackFixture('V1', 'video'), trackFixture('A1', 'audio', clips, extra)])

describe('cueing one slice', () => {
  it('places a chunk on the output clock, the sequence anchored at the origin', () => {
    expect(cueFor(chunk({ at: 3_000_000, sourceStart: 500_000 }), 10, 10)).toEqual({
      when: 13,
      offset: 0.5,
      duration: 2,
      rate: 1,
      gain: 1,
      ramps: [],
    })
  })

  // Nothing to say: a clip with neither ramp holds one level from its first instant to its last.
  it('asks for no ramp at all when the clip has no fade', () => {
    expect(cueFor(chunk(), 0, 0)?.ramps).toEqual([])
  })

  it('comes in from silence and reaches full level where the rise ends', () => {
    const cue = cueFor(ramped({ risenAt: 500_000 }), 0, 0)

    expect(cue).toMatchObject({ gain: 0, ramps: [{ when: 0.5, level: 1 }] })
  })

  /**
   * The plateau is a corner too: without it the fall would start from the slice's first instant
   * and the clip would sink through its whole length instead of its last fraction.
   */
  it('holds full level up to the fall, then reaches silence at the end', () => {
    const cue = cueFor(ramped({ fallsFrom: 1_600_000 }), 0, 0)

    expect(cue).toMatchObject({
      gain: 1,
      ramps: [
        { when: 1.6, level: 1 },
        { when: 2, level: 0 },
      ],
    })
  })

  /**
   * A slice is planned before its sound is loaded, and a load that ran past half the fade-in must
   * come in half way up. A ramp length measured from the clip's edge could not say this.
   */
  it('enters part-way up when the load ate half the rise', () => {
    const cue = cueFor(ramped({ risenAt: 1_000_000 }), 0, 0.5)

    expect(cue).toMatchObject({ when: 0.5, gain: 0.5, ramps: [{ when: 1, level: 1 }] })
  })

  it("folds the clip's own gain into the envelope, so the output never scales twice", () => {
    const cue = cueFor(ramped({ risenAt: 500_000 }, { gain: -6 }), 0, 0)

    expect(cue?.ramps[0]?.level).toBeCloseTo(0.501_187, 6)
  })

  /**
   * The timeline and the output clock run 1:1; a rate only changes how fast the source is eaten
   * between two instants that stay where they are.
   */
  it('leaves the envelope where it is for a clip with a speed', () => {
    const cue = cueFor(ramped({ risenAt: 1_000_000 }, { speed: 2 }), 0, 0)

    expect(cue).toMatchObject({ duration: 4, ramps: [{ when: 1, level: 1 }] })
  })

  /**
   * The ordinary case, and the only one with three corners: the rise, the plateau the fall starts
   * from, and silence. Built from a real clip rather than a hand-made envelope, because that is
   * where the order comes from — `clampFades` holds a clip's rise before its fall on every path
   * that builds one, and `rampsFor` trusts it rather than sorting its own corners.
   */
  it('rises, holds, then falls for a clip faded at both ends', () => {
    const faded = clip('a', 0, 2_000_000, { fadeIn: 500_000, fadeOut: 500_000 })
    const planned = audioChunksIn(withAudio([faded]), 0, 2_000_000)[0]

    expect(planned && cueFor(planned, 0, 0)).toMatchObject({
      gain: 0,
      ramps: [
        { when: 0.5, level: 1 },
        { when: 1.5, level: 1 },
        { when: 2, level: 0 },
      ],
    })
  })

  // The window may end before the fall does, and the level it ends at is not silence.
  it('ends on the level the slice actually reaches when it stops mid-fall', () => {
    const cue = cueFor(ramped({ fallsFrom: 1_000_000 }, { duration: 1_500_000 }), 0, 0)

    expect(cue?.ramps).toEqual([
      { when: 1, level: 1 },
      { when: 1.5, level: 0.5 },
    ])
  })

  it('converts the decibels the clip carries, so the output never sees a decibel', () => {
    // −6 dB is half the amplitude, near enough for a comparison at six digits.
    expect(cueFor(chunk({ gain: -6 }), 0, 0)?.gain).toBeCloseTo(0.501_187, 6)
  })

  /**
   * A slice is planned before it is loaded, and a minute of music takes long enough to decode
   * to miss its own start. Playing the late part anyway holds the sound behind the picture for
   * the whole clip.
   */
  it('skips what a slow load already missed rather than playing it late', () => {
    const late = cueFor(chunk({ at: 0, duration: 2_000_000 }), 0, 0.5)

    expect(late).toMatchObject({ when: 0.5, offset: 0.5, duration: 1.5 })
  })

  it('reads the source faster than the timeline for a clip with a speed', () => {
    // Two seconds of timeline at double rate spends four seconds of source.
    expect(cueFor(chunk({ speed: 2 }), 0, 0)).toMatchObject({ duration: 4, rate: 2 })
  })

  it('skips into the source at the clip rate when the load was late', () => {
    const late = cueFor(chunk({ speed: 2, sourceStart: 1_000_000 }), 0, 0.5)

    // Half a second late at double rate is a whole second of source gone.
    expect(late).toMatchObject({ offset: 2, duration: 3 })
  })

  it('plays nothing at all for a slice that is entirely over', () => {
    expect(cueFor(chunk({ duration: 1_000_000 }), 0, 2)).toBeNull()
  })
})
