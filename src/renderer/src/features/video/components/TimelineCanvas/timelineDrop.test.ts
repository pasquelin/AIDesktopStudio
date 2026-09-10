import { beforeEach, describe, expect, it } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { sequenceWith, trackFixture } from '@/engines/timeline/timeline-fixtures'
import { RULER_HEIGHT } from '@/engines/timeline/timelineGeometry'
import { sequenceOf, useSequences } from '@/stores/sequences'
import { placeTimelineAssetAt } from './timelineDrop'

const DOCUMENT = 'doc-cut'
const SECOND = 1_000_000

const rush = (id: string): Asset => ({
  id,
  name: `${id}.mp4`,
  type: 'video',
  location: 'local',
  path: `Video/${id}.mp4`,
  tags: [],
  createdAt: '2026-09-10T09:00:00.000Z',
  probe: { duration: 2 * SECOND, codec: 'avc1', width: 1920, height: 1080 },
})

/**
 * V5 — several files dropped together go in END TO END from the point the pointer was let go at.
 * Placed at one time they read as five clips on one frame, which is not a cut.
 */
describe('a lot of files landing on a montage', () => {
  const sequence = sequenceWith([trackFixture('track-1', 'video')])
  // One track, one row high: a point below the ruler lands on it.
  const context = {
    documentId: DOCUMENT,
    sequence,
    viewport: { scale: 0.0001, offset: 0, scrollTop: 0 },
    pointAt: () => ({ x: 0, y: RULER_HEIGHT + 10 }),
  }

  beforeEach(() => {
    useSequences.getState().replace(DOCUMENT, sequence)
  })

  it('answers where the clip it laid down ends', () => {
    const landed = placeTimelineAssetAt(context, rush('a'), context.pointAt(), null)

    expect(landed).toBe(2 * SECOND)
  })

  it('starts the next one where the last one ended', () => {
    const first = placeTimelineAssetAt(context, rush('a'), context.pointAt(), null)
    placeTimelineAssetAt(context, rush('b'), context.pointAt(), first)

    const clips = sequenceOf(useSequences.getState(), DOCUMENT).tracks[0]?.clips ?? []
    expect(clips.map(clip => clip.start)).toEqual([0, 2 * SECOND])
  })
  /**
   * Below the last track the hit test answers « no row » — and it reads the montage as it was
   * when the drag began, so it answers that for every file of the lot. Each one opened a row of
   * its own: five rushes came out as five tracks, one clip each.
   */
  it('lands the rest of a lot on the rows the first one opened', () => {
    const under = { ...context, pointAt: () => ({ x: 0, y: 400 }) }

    const first = placeTimelineAssetAt(under, rush('a'), under.pointAt(), null)
    placeTimelineAssetAt(under, rush('b'), under.pointAt(), first)

    const tracks = sequenceOf(useSequences.getState(), DOCUMENT).tracks
    expect(tracks).toHaveLength(2)
    expect(tracks.flatMap(track => track.clips)).toHaveLength(2)
  })
})
