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
})
