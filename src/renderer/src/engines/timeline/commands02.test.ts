import { describe, expect, it } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import {
  addClip,
  addClips,
  addClipsOnNewTracks,
  addTrack,
  moveClip,
  moveTrack,
  removeClip,
  removeTrack,
  setClipSpeed,
  splitClip,
  trimClip,
  unlinkClip,
} from './commands'
import { clipFixture, sequenceWith, trackFixture } from './timeline-fixtures'
import { reindexTracks, type Clip, type SequenceState } from './timelineState'

describe('a take whose picture and sound are linked', () => {
  const LINK = 'link-1'

  const take = (): SequenceState =>
    sequenceWith([
      trackFixture('V1', 'video', [clipFixture('v', 1_000_000, 2_000_000, { linkId: LINK })]),
      trackFixture('A1', 'audio', [clipFixture('a', 1_000_000, 2_000_000, { linkId: LINK })]),
    ])

  const clipOf = (state: SequenceState, id: string): Clip | undefined =>
    state.tracks.flatMap(track => track.clips).find(clip => clip.id === id)

  it('drags the sound along when the picture is dragged, and back on undo', () => {
    const command = moveClip('v', 'V1', 3_000_000)
    const state = take()

    const moved = command.apply(state)

    expect(clipOf(moved, 'v')?.start).toBe(3_000_000)
    expect(clipOf(moved, 'a')?.start).toBe(3_000_000)
    expect(command.revert(moved)).toEqual(state)
  })

  // The twin stays where it can be heard: one audio track is the ordinary sequence, and a sound
  // moved onto a picture track is painted rather than played.
  it('keeps the sound on its own track when the picture changes track', () => {
    const moved = moveClip('v', 'V2', 1_000_000).apply({
      ...take(),
      tracks: [...take().tracks, trackFixture('V2', 'video', [], { index: 2 })],
    })

    expect(moved.tracks.find(track => track.id === 'V2')?.clips).toHaveLength(1)
    expect(moved.tracks.find(track => track.id === 'A1')?.clips).toHaveLength(1)
  })

  /**
   * Every one of these commands selects what it edited, and the twin is applied last: clicking
   * the picture put the inspector on the sound, and the sound on the picture. It read as a
   * montage that selects the wrong half of everything.
   */
  it('leaves the selection on the half that was touched', () => {
    expect(moveClip('v', 'V1', 3_000_000).apply(take()).selectedId).toBe('v')
    expect(moveClip('a', 'A1', 3_000_000).apply(take()).selectedId).toBe('a')
  })

  it('trims both edges together', () => {
    const trimmed = trimClip('v', 'out', 2_000_000, 'unknown').apply(take())

    expect(clipOf(trimmed, 'v')?.duration).toBe(1_000_000)
    expect(clipOf(trimmed, 'a')?.duration).toBe(1_000_000)
  })

  it('cuts both, and ties the two tails to each other rather than to the heads', () => {
    const cut = splitClip('v', 2_000_000).apply(take())
    const clips = cut.tracks.flatMap(track => track.clips)
    const tails = clips.filter(clip => clip.start === 2_000_000)
    const heads = clips.filter(clip => clip.start === 1_000_000)

    expect(tails).toHaveLength(2)
    expect(tails[0]?.linkId).toBe(tails[1]?.linkId)
    expect(heads[0]?.linkId).toBe(LINK)
    // Otherwise dragging one head would drag the far side of the cut with it.
    expect(tails[0]?.linkId).not.toBe(LINK)
  })

  it('deletes both, since a picture whose sound stays behind is never what was meant', () => {
    const cleared = removeClip('v').apply(take())
    expect(cleared.tracks.flatMap(track => track.clips)).toEqual([])
  })

  /**
   * `speed` is read on both sides — `sourceTimeAt` seeks the picture with it, `SoundCue.rate`
   * resamples the sound with it — so a change on one half alone drifts the two apart for good.
   * A gain and a fade are each half's own business and stay unlinked.
   */
  it('runs the sound at the speed the picture was given', () => {
    const faster = setClipSpeed('v', 2).apply(take())

    expect(clipOf(faster, 'v')?.speed).toBe(2)
    expect(clipOf(faster, 'a')?.speed).toBe(2)
  })

  it('unties the pair, so each half can then be edited alone', () => {
    const command = unlinkClip('v')
    const state = take()

    const untied = command.apply(state)

    expect(clipOf(untied, 'v')?.linkId).toBeUndefined()
    expect(clipOf(untied, 'a')?.linkId).toBeUndefined()
    // Undo puts the link back: unlinking is an edit like any other.
    expect(command.revert(untied)).toEqual(state)
    expect(clipOf(removeClip('v').apply(untied), 'a')).toBeDefined()
  })

  /**
   * Both halves or neither. A locked sound track is an ordinary editing move, and the edit went
   * through on the picture alone: the take was then desynced for good, which is the one failure
   * the link exists to prevent.
   */
  it('refuses the whole edit when one half sits on a locked track', () => {
    const state = sequenceWith([
      trackFixture('V1', 'video', [clipFixture('v', 1_000_000, 2_000_000, { linkId: LINK })]),
      trackFixture('A1', 'audio', [clipFixture('a', 1_000_000, 2_000_000, { linkId: LINK })], {
        locked: true,
      }),
    ])

    expect(moveClip('v', 'V1', 3_000_000).apply(state)).toBe(state)
    expect(trimClip('v', 'out', 2_000_000, 'unknown').apply(state)).toBe(state)
    expect(removeClip('v').apply(state)).toBe(state)
  })

  /**
   * A clip dropped inside a linked take leaves two pieces of it. Sharing one link, the head and
   * the far side of the cut moved and were deleted together — and the sound followed whichever
   * of them was dragged.
   */
  it('leaves the tail of an insertion unlinked, since only the head kept its sound', () => {
    const cut = addClip('V1', clipFixture('b', 2_000_000, 500_000)).apply(take())
    const clips = cut.tracks[0]?.clips ?? []

    expect(clips.map(clip => clip.start)).toEqual([1_000_000, 2_000_000, 2_500_000])
    expect(clips[0]?.linkId).toBe(LINK)
    expect(clips[2]?.linkId).toBeUndefined()
  })

  it('lays a take down as one history entry, so undo takes back both clips', () => {
    const command = addClips([
      { trackId: 'V1', clip: clipFixture('v', 0, 1_000_000, { linkId: LINK }) },
      { trackId: 'A1', clip: clipFixture('a', 0, 1_000_000, { linkId: LINK }) },
    ])
    const state = sequenceWith([trackFixture('V1', 'video'), trackFixture('A1', 'audio')])

    const dropped = command.apply(state)

    expect(dropped.tracks.flatMap(track => track.clips)).toHaveLength(2)
    // The picture, never the last part that ran: it is the half the user aimed at.
    expect(dropped.selectedId).toBe('v')
    expect(command.revert(dropped)).toEqual(state)
  })
})

describe('track commands', () => {
  const twoTracks = (): SequenceState =>
    sequenceWith([trackFixture('V1', 'video'), trackFixture('A1', 'audio')])

  it('adds a track at the bottom, named after the first free number of its kind', () => {
    const next = addTrack('video').apply(twoTracks())
    expect(next.tracks.map(track => track.id)).toEqual(['V1', 'A1', 'V2'])
  })

  it('gives two adds two names, since the second sees what the first took', () => {
    const state = addTrack('audio').apply(twoTracks())
    const next = addTrack('audio').apply(state)
    expect(next.tracks.map(track => track.id)).toEqual(['V1', 'A1', 'A2', 'A3'])
  })

  it('reverts an add by taking the track back out', () => {
    const command = addTrack('video')
    const state = twoTracks()
    expect(command.revert(command.apply(state))).toEqual(state)
  })

  it('reads depth back from position, so the top row is the one drawn on top', () => {
    const next = addTrack('video').apply(twoTracks())
    expect(next.tracks.map(track => track.index)).toEqual([2, 1, 0])
  })

  it('removes a track with the clips it carried', () => {
    const state = sequenceWith([
      trackFixture('V1', 'video', [clipFixture('a', 0, 1_000)]),
      trackFixture('A1', 'audio'),
    ])
    const next = removeTrack('V1').apply(state)
    expect(next.tracks.map(track => track.id)).toEqual(['A1'])
  })

  it('puts a removed track back on the row it was on, clips and all', () => {
    const state = sequenceWith([
      trackFixture('V1', 'video'),
      trackFixture('V2', 'video', [clipFixture('a', 0, 1_000)], { index: 2 }),
      trackFixture('A1', 'audio'),
    ])
    const command = removeTrack('V2')
    const back = command.revert(command.apply(state))
    expect(back.tracks.map(track => track.id)).toEqual(['V1', 'V2', 'A1'])
    expect(back.tracks[1]?.clips).toHaveLength(1)
  })

  it('drops the selection when the removed track was carrying it', () => {
    const state: SequenceState = {
      ...sequenceWith([
        trackFixture('V1', 'video', [clipFixture('a', 0, 1_000)]),
        trackFixture('A1', 'audio'),
      ]),
      selectedId: 'a',
    }
    expect(removeTrack('V1').apply(state).selectedId).toBeNull()
  })

  // The row itself as much as what sat on it: a header taken away while designated left the
  // inspector describing a track the column no longer holds. Undo puts it back with the track.
  it('drops the designated row with the track it names, and gives it back on undo', () => {
    const state: SequenceState = {
      ...sequenceWith([trackFixture('V1', 'video'), trackFixture('A1', 'audio')]),
      selectedTrackId: 'V1',
    }
    const command = removeTrack('V1')

    expect(command.apply(state).selectedTrackId).toBeNull()
    expect(command.revert(command.apply(state)).selectedTrackId).toBe('V1')
  })

  it('leaves a locked track where it is', () => {
    const state = sequenceWith([trackFixture('V1', 'video', [], { locked: true })])
    expect(removeTrack('V1').apply(state)).toEqual(state)
  })

  it('moves a track one row down', () => {
    const next = moveTrack('V1', 1).apply(twoTracks())
    expect(next.tracks.map(track => track.id)).toEqual(['A1', 'V1'])
  })

  it('refuses to move a track off either end', () => {
    const state = twoTracks()
    expect(moveTrack('V1', -1).apply(state)).toEqual(state)
    expect(moveTrack('A1', 1).apply(state)).toEqual(state)
  })

  it('reverts a move by putting the track back on its row', () => {
    const command = moveTrack('V1', 1)
    const state = twoTracks()
    expect(command.revert(command.apply(state))).toEqual(state)
  })

  // What a DRAG costs: successive steps coalesce into one entry keeping the first revert, and by
  // then the track stands several rows from where a `from + by` arithmetic would look for it.
  it('reverts a run of steps in one press, from wherever the track ended up', () => {
    // Already reindexed, as every montage on screen is: a fixture's own indices are not the
    // stack's, and the comparison below is about rows, not about numbering.
    const state = sequenceWith(
      reindexTracks([
        trackFixture('V1', 'video'),
        trackFixture('V2', 'video'),
        trackFixture('A1', 'audio'),
      ]),
    )
    const first = moveTrack('V1', 1)
    const second = moveTrack('V1', 1)

    const dragged = second.apply(first.apply(state))
    expect(dragged.tracks.map(track => track.id)).toEqual(['V2', 'A1', 'V1'])
    expect(first.revert(dragged)).toEqual(state)
  })

  // The other half of the same entry: ⌘⇧Z has to put the track back where the drag left it, and
  // the last step alone knows only its own `by`.
  it('replays the whole drag on redo, not its last step', () => {
    const state = sequenceWith(
      reindexTracks([
        trackFixture('V1', 'video'),
        trackFixture('V2', 'video'),
        trackFixture('A1', 'audio'),
      ]),
    )
    const first = moveTrack('V1', 1)
    const second = moveTrack('V1', 1)
    const dragged = second.apply(first.apply(state))

    expect(second.apply(first.revert(dragged)).tracks.map(track => track.id)).toEqual([
      'V2',
      'A1',
      'V1',
    ])
  })

  it('re-reads depth after a move, so what is drawn follows what is shown', () => {
    const next = moveTrack('V1', 1).apply(twoTracks())
    expect(next.tracks.map(track => [track.id, track.index])).toEqual([
      ['A1', 1],
      ['V1', 0],
    ])
  })
})

describe('a drop into the empty space below the last track', () => {
  const montage = (): SequenceState =>
    sequenceWith([trackFixture('V1', 'video'), trackFixture('A1', 'audio')])

  const take: Asset = {
    id: 'asset-1',
    name: 'take.mp4',
    type: 'video',
    location: 'local',
    tags: [],
    createdAt: '2026-08-15T10:00:00.000Z',
    probe: { duration: 5_000_000, codec: 'h264', channels: 2 },
  }

  it('opens the rows it needs and lays the take across them, tied together', () => {
    const next = addClipsOnNewTracks(take, 'asset-1', 0).apply(montage())
    const [, , picture, sound] = next.tracks

    expect(next.tracks.map(track => track.id)).toEqual(['V1', 'A1', 'V2', 'A2'])
    expect(picture?.clips).toHaveLength(1)
    expect(sound?.clips).toHaveLength(1)
    expect(picture?.clips[0]?.linkId).toBe(sound?.clips[0]?.linkId)
  })

  // The rows are half of what the gesture did: undoing only the clips leaves a montage that
  // grows an empty pair every time a drop is taken back.
  it('takes the rows back with the clips', () => {
    const command = addClipsOnNewTracks(take, 'asset-1', 0)
    const state = montage()
    expect(command.revert(command.apply(state))).toEqual(state)
  })

  it('lays the redo on the very rows undo had taken away', () => {
    const command = addClipsOnNewTracks(take, 'asset-1', 0)
    const state = montage()
    const dropped = command.apply(state)
    expect(command.apply(command.revert(dropped))).toEqual(dropped)
  })

  it('leaves a montage that holds no picture row untouched', () => {
    const sound = sequenceWith([trackFixture('A1', 'audio')])
    expect(addClipsOnNewTracks(take, 'asset-1', 0).apply(sound)).toEqual(sound)
  })
})
