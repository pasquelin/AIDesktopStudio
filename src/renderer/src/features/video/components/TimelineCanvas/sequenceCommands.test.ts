import { beforeEach, describe, expect, it } from 'vitest'
import { EMPTY_SEQUENCE, makeClip, makeTrack } from '@/engines/timeline/timelineState'
import { installSequence } from '@/stores/sequence-fixtures'
import { sequenceOf, useSequences } from '@/stores/sequences'
import { runSequenceCommand } from './sequenceCommands'

const DOCUMENT = 'doc-1'
const SECOND = 1_000_000

const sequence = () => sequenceOf(useSequences.getState(), DOCUMENT)
const clips = () => sequence().tracks.flatMap(track => track.clips)

beforeEach(() => {
  installSequence(DOCUMENT, {
    ...EMPTY_SEQUENCE,
    playhead: 2 * SECOND,
    tracks: [
      makeTrack({
        id: 'track-video',
        kind: 'video',
        index: 0,
        clips: [makeClip({ id: 'clip-a', assetId: 'asset-rush', start: 0, duration: 4 * SECOND })],
      }),
    ],
  })
})

describe('the commands of a montage that read nothing but its stores', () => {
  it('splits the clip under the head, and says so', () => {
    expect(runSequenceCommand(DOCUMENT, 'sequence.split')).toBe(true)

    expect(clips().map(clip => clip.duration)).toEqual([2 * SECOND, 2 * SECOND])
  })

  it('has nothing to split where no clip sits under the head', () => {
    runSequenceCommand(DOCUMENT, 'sequence.end')
    expect(sequence().playhead).toBe(4 * SECOND)

    expect(runSequenceCommand(DOCUMENT, 'sequence.split')).toBe(false)
    expect(clips()).toHaveLength(1)
  })

  it('takes the chosen clip away, and nothing when none is chosen', () => {
    expect(runSequenceCommand(DOCUMENT, 'sequence.delete')).toBe(false)

    useSequences.getState().replace(DOCUMENT, { ...sequence(), selectedId: 'clip-a' })
    expect(runSequenceCommand(DOCUMENT, 'sequence.delete')).toBe(true)
    expect(clips()).toEqual([])
  })

  it('answers the empty stack, then the split it can take back', () => {
    expect(runSequenceCommand(DOCUMENT, 'sequence.undo')).toBe(false)

    runSequenceCommand(DOCUMENT, 'sequence.split')
    expect(runSequenceCommand(DOCUMENT, 'sequence.undo')).toBe(true)
    expect(clips()).toHaveLength(1)
  })

  it('leaves the zoom and the exports to the strip', () => {
    expect(runSequenceCommand(DOCUMENT, 'sequence.zoomIn')).toBe(false)
  })
})
