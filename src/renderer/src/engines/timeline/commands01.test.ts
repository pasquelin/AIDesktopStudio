import { describe, expect, it } from 'vitest'
import { addClip, moveClip, removeClip, splitClip, trimClip } from './commands'
import { clipFixture, sequenceWith, trackFixture } from './timeline-fixtures'
import { type Clip, type SequenceState } from './timelineState'

const clip = clipFixture

const withClips = (clips: Clip[], locked = false): SequenceState =>
  sequenceWith([
    trackFixture('V1', 'video', clips, { locked }),
    trackFixture('V2', 'video', [], { index: 2 }),
  ])

describe('sequence commands', () => {
  // The inspector follows the last thing pressed: a drop describes what it laid down, not the
  // row a header press had put the panel on.
  it('takes the inspector off a designated row when it lays a clip down', () => {
    const state: SequenceState = { ...withClips([]), selectedTrackId: 'V1' }
    const next = addClip('V1', clip('a', 0, 1_000)).apply(state)

    expect(next.selectedId).toBe('a')
    expect(next.selectedTrackId).toBeNull()
  })

  it('adds a clip and selects it', () => {
    const command = addClip('V1', clip('a', 0, 1_000))
    const next = command.apply(withClips([]))
    expect(next.tracks[0]?.clips).toHaveLength(1)
    expect(next.selectedId).toBe('a')
  })

  it('reverts an add by removing the clip again', () => {
    const command = addClip('V1', clip('a', 0, 1_000))
    const state = withClips([])
    expect(command.revert(command.apply(state))).toEqual(state)
  })

  it('leaves a locked track untouched', () => {
    const command = addClip('V1', clip('a', 0, 1_000))
    const state = withClips([], true)
    expect(command.apply(state)).toEqual(state)
  })

  it('moves a clip to another track at a snapped position', () => {
    const command = moveClip('a', 'V2', 41_000)
    const next = command.apply(withClips([clip('a', 0, 1_000)]))
    expect(next.tracks[0]?.clips).toHaveLength(0)
    expect(next.tracks[1]?.clips[0]).toMatchObject({ id: 'a', start: 40_000 })
  })

  it('reverts a move back to the original track and position', () => {
    const command = moveClip('a', 'V2', 41_000)
    const state = withClips([clip('a', 0, 1_000)])
    expect(command.revert(command.apply(state))).toEqual(state)
  })

  it('trims the out edge', () => {
    const command = trimClip('a', 'out', 600_000, 'unknown')
    const next = command.apply(withClips([clip('a', 0, 1_000_000)]))
    expect(next.tracks[0]?.clips[0]).toMatchObject({ start: 0, duration: 600_000, inPoint: 0 })
  })

  it('trims the in edge, moving both start and in point', () => {
    const command = trimClip('a', 'in', 200_000, 'still')
    const next = command.apply(withClips([clip('a', 0, 1_000_000)]))
    expect(next.tracks[0]?.clips[0]).toMatchObject({
      start: 200_000,
      duration: 800_000,
      inPoint: 200_000,
    })
  })

  it('refuses a trim that would leave nothing rather than clamping it to zero', () => {
    const state = withClips([clip('a', 0, 1_000_000)])
    expect(trimClip('a', 'out', 0, 'unknown').apply(state)).toEqual(state)
    expect(trimClip('a', 'in', 1_000_000, 'unknown').apply(state)).toEqual(state)
  })

  it('splits a clip in two, the second one starting later in the source', () => {
    const next = splitClip('a', 400_000).apply(withClips([clip('a', 0, 1_000_000)]))
    expect(next.tracks[0]?.clips).toHaveLength(2)
    expect(next.tracks[0]?.clips[0]).toMatchObject({ start: 0, duration: 400_000, inPoint: 0 })
    expect(next.tracks[0]?.clips[1]).toMatchObject({
      start: 400_000,
      duration: 600_000,
      inPoint: 400_000,
    })
  })

  it('gives each insertion its own tail id, so two drops on one neighbour stay distinct', () => {
    const first = addClip('V1', clip('b', 1_000, 1_000)).apply(withClips([clip('a', 0, 3_000)]))
    const second = addClip('V1', clip('c', 200, 400)).apply(first)
    const ids = second.tracks[0]?.clips.map(candidate => candidate.id) ?? []

    expect(ids).toHaveLength(5)
    expect(new Set(ids).size).toBe(5)
  })

  it('gives each cut its own tail id, so cutting the same clip twice keeps ids distinct', () => {
    const once = splitClip('a', 2_000_000).apply(withClips([clip('a', 0, 4_000_000)]))
    const twice = splitClip('a', 1_000_000).apply(once)
    const ids = twice.tracks[0]?.clips.map(candidate => candidate.id) ?? []

    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
  })

  it('keeps the tail id stable across a redo, so nothing points at a clip that moved', () => {
    const command = splitClip('a', 400_000)
    const state = withClips([clip('a', 0, 1_000_000)])
    const first = command.apply(state)
    const again = command.apply(command.revert(first))

    expect(again.tracks[0]?.clips[1]?.id).toBe(first.tracks[0]?.clips[1]?.id)
  })

  it('refuses a split on an exact edge, which would produce an empty clip', () => {
    const state = withClips([clip('a', 0, 1_000_000)])
    expect(splitClip('a', 0).apply(state)).toEqual(state)
    expect(splitClip('a', 1_000_000).apply(state)).toEqual(state)
  })

  it('reverts a split by restoring the single clip', () => {
    const command = splitClip('a', 400_000)
    const state = withClips([clip('a', 0, 1_000_000)])
    expect(command.revert(command.apply(state))).toEqual(state)
  })

  it('reverts a removal at the original index', () => {
    const command = removeClip('a')
    const state = withClips([clip('a', 0, 1_000), clip('b', 2_000, 1_000)])
    expect(command.revert(command.apply(state))).toEqual(state)
  })

  it('restores the previous selection when an add is reverted', () => {
    const state = { ...withClips([clip('b', 0, 1_000)]), selectedId: 'b' }
    const command = addClip('V1', clip('a', 5_000, 1_000))
    expect(command.revert(command.apply(state)).selectedId).toBe('b')
  })

  it('grows a trim over the neighbour, which gives way as it would under a drop', () => {
    const state = withClips([clip('a', 0, 1_000_000), clip('b', 1_000_000, 1_000_000)])
    const next = trimClip('a', 'out', 1_800_000, 'unknown').apply(state)

    expect(next.tracks[0]?.clips[0]).toMatchObject({ id: 'a', duration: 1_800_000 })
    // What is left of the neighbour starts later in the source, as a trimmed head does.
    expect(next.tracks[0]?.clips[1]).toMatchObject({
      id: 'b',
      start: 1_800_000,
      duration: 200_000,
      inPoint: 800_000,
    })
  })

  it('swallows a neighbour a trim covers whole', () => {
    const state = withClips([clip('a', 0, 1_000_000), clip('b', 1_000_000, 500_000)])
    const next = trimClip('a', 'out', 2_000_000, 'unknown').apply(state)

    expect(next.tracks[0]?.clips.map(candidate => candidate.id)).toEqual(['a'])
  })

  it('grows the in point over the clip before it too', () => {
    const state = withClips([
      clip('a', 0, 1_000_000),
      clip('b', 1_000_000, 1_000_000, {
        inPoint: 1_000_000,
      }),
    ])
    const next = trimClip('b', 'in', 400_000, 'unknown').apply(state)

    expect(next.tracks[0]?.clips[0]).toMatchObject({ id: 'a', duration: 400_000 })
    expect(next.tracks[0]?.clips[1]).toMatchObject({ id: 'b', start: 400_000, inPoint: 400_000 })
  })

  it('puts back the neighbours a trim overwrote', () => {
    const command = trimClip('a', 'out', 1_800_000, 'unknown')
    const state = withClips([clip('a', 0, 1_000_000), clip('b', 1_000_000, 1_000_000)])

    expect(command.revert(command.apply(state)).tracks[0]?.clips).toEqual(state.tracks[0]?.clips)
  })

  it('lets a trim run freely when there is no neighbour in the way', () => {
    const next = trimClip('a', 'out', 3_000_000, 'unknown').apply(
      withClips([clip('a', 0, 1_000_000)]),
    )
    expect(next.tracks[0]?.clips[0]?.duration).toBe(3_000_000)
  })

  it('stops the out point where the source ends', () => {
    const state = withClips([clip('a', 0, 1_000_000)])
    const next = trimClip('a', 'out', 9_000_000, 2_000_000).apply(state)

    // A clip stretched past its source freezes on a frame while its sound goes silent.
    expect(next.tracks[0]?.clips[0]?.duration).toBe(2_000_000)
  })

  it('counts the source from the in point, not from the clip start', () => {
    const state = withClips([clip('a', 0, 1_000_000, { inPoint: 1_500_000 })])
    const next = trimClip('a', 'out', 9_000_000, 2_000_000).apply(state)

    expect(next.tracks[0]?.clips[0]?.duration).toBe(500_000)
  })

  it('measures the source at the clip speed, which is what the decoder reads at', () => {
    const state = withClips([clip('a', 0, 1_000_000, { speed: 2 })])
    const next = trimClip('a', 'out', 9_000_000, 2_000_000).apply(state)

    // Two seconds of source run past in one second of timeline at double speed.
    expect(next.tracks[0]?.clips[0]?.duration).toBe(1_000_000)
  })

  it('stops the in point where the source begins', () => {
    const state = withClips([clip('a', 1_000_000, 1_000_000, { inPoint: 400_000 })])
    const next = trimClip('a', 'in', 0, 5_000_000).apply(state)

    expect(next.tracks[0]?.clips[0]).toMatchObject({ start: 600_000, inPoint: 0 })
  })

  it('leaves a still unbounded, which is how a title card is stretched', () => {
    const next = trimClip('a', 'out', 9_000_000, 'still').apply(
      withClips([clip('a', 0, 1_000_000)]),
    )
    expect(next.tracks[0]?.clips[0]?.duration).toBe(9_000_000)
  })

  it('lengthens a still by its in edge too, which a source-bound clip cannot do', () => {
    const state = withClips([clip('a', 2_000_000, 1_000_000)])
    const next = trimClip('a', 'in', 1_000_000, 'still').apply(state)

    // The image has no source to run past, so pulling its left end grows it the way the right
    // end already did — the bound there only ever made sense for a video.
    expect(next.tracks[0]?.clips[0]).toMatchObject({ start: 1_000_000, duration: 2_000_000 })
  })

  it('holds a stretched still at the start of the sequence, never before it', () => {
    const state = withClips([clip('a', 1_000_000, 1_000_000)])
    const next = trimClip('a', 'in', -5_000_000, 'still').apply(state)

    expect(next.tracks[0]?.clips[0]?.start).toBe(0)
  })

  it('holds a stretched still at its source start, so the project reloads as it was saved', () => {
    const state = withClips([clip('a', 2_000_000, 1_000_000)])
    const next = trimClip('a', 'in', 1_000_000, 'still').apply(state)

    // `readPositive` drops a negative in point on reload; a clip that came back with a different
    // one would not be the clip that was saved.
    expect(next.tracks[0]?.clips[0]?.inPoint).toBe(0)
  })

  /**
   * `mediaDuration` answers null for a still AND for an asset nobody has probed yet, so the two
   * used to arrive here as the same thing. Only the first has no source: a rush whose length is
   * merely unknown still starts somewhere, and letting its in point run before that start would
   * freeze the tail of the clip on a frame with its sound gone.
   */
  it('keeps the in point bounded on a rush nobody has probed yet, unlike a still', () => {
    const state = withClips([clip('a', 2_000_000, 1_000_000)])
    const next = trimClip('a', 'in', 1_000_000, 'unknown').apply(state)

    // Its in point is zero, so `clip.start - headroom(0)` is the clip's own start: refused.
    expect(next).toEqual(state)
  })

  it('lets an unprobed rush give back the head it had already trimmed, and no more', () => {
    const state = withClips([clip('a', 2_000_000, 1_000_000, { inPoint: 400_000 })])
    const next = trimClip('a', 'in', 1_000_000, 'unknown').apply(state)

    expect(next.tracks[0]?.clips[0]).toMatchObject({ start: 1_600_000, inPoint: 0 })
  })

  it('still stops a video at its source start, which is the bound a still does not have', () => {
    const state = withClips([clip('a', 2_000_000, 1_000_000, { inPoint: 400_000 })])
    const next = trimClip('a', 'in', 1_000_000, 5_000_000).apply(state)

    expect(next.tracks[0]?.clips[0]).toMatchObject({ start: 1_600_000, inPoint: 0 })
  })

  it('puts back the neighbours an added clip overwrote', () => {
    const command = addClip('V1', clip('b', 500_000, 1_000_000))
    const state = withClips([clip('a', 0, 2_000_000)])

    const after = command.apply(state)
    expect(after.tracks[0]?.clips).toHaveLength(3)

    // Undo has to give back the state it was pressed from, not just remove the newcomer.
    expect(command.revert(after).tracks[0]?.clips).toEqual(state.tracks[0]?.clips)
  })

  it('puts back the neighbours a moved clip overwrote on the track it landed on', () => {
    const state = withClips([clip('a', 0, 500_000)])
    const seeded = addClip('V2', clip('x', 1_000_000, 2_000_000)).apply(state)

    const command = moveClip('a', 'V2', 1_500_000)
    const after = command.apply(seeded)
    const back = command.revert(after)

    expect(back.tracks[1]?.clips).toEqual(seeded.tracks[1]?.clips)
    expect(back.tracks[0]?.clips).toEqual(seeded.tracks[0]?.clips)
  })
})

/**
 * A take is two clips, and an editor expects them to behave as one thing: what an edit does to
 * the picture it does to the sound, until the two are unlinked on purpose. Anything less drifts
 * lip sync on the first drag, which is the one defect an edit cannot recover from by eye.
 */
