import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Asset } from '@shared/domain/asset'
import { assistantAction, type ActionName } from '@shared/domain/assistant'
import {
  CLIP_EDGES,
  EMPTY_SEQUENCE,
  makeClip,
  makeTrack,
  MAX_GAIN_DB,
  MAX_SPEED,
  MIN_GAIN_DB,
  MIN_SPEED,
  TRACK_KINDS,
  type SequenceState,
} from '@/engines/timeline/timelineState'
import { installFakeBridge } from '@/services/fakeBridge'
import { installIn } from '@/stores/document-fixtures'
import { useDocuments } from '@/stores/documents'
import { sequenceHistoryOf, sequenceOf, sequenceStore, useSequences } from '@/stores/sequences'
import { runAction } from './executor'

const DOCUMENT = 'doc-sequence'
const SECOND = 1_000_000

const RUSH: Asset = {
  id: 'asset-rush',
  name: 'Plan large',
  type: 'video',
  location: 'local',
  tags: [],
  createdAt: '2026-08-17T10:00:00.000Z',
  probe: { duration: 4 * SECOND, codec: 'h264' },
}

function sequence(): SequenceState {
  return sequenceOf(useSequences.getState(), DOCUMENT)
}

const clipIds = (): string[] => sequence().tracks.flatMap(track => track.clips.map(clip => clip.id))

function withMontage(state: SequenceState): void {
  installIn(sequenceStore, DOCUMENT, state, 'video')
}

/** One picture row carrying one four-second clip, which is the shape most of these start from. */
function laid(): SequenceState {
  return {
    ...EMPTY_SEQUENCE,
    tracks: [
      makeTrack({
        id: 'track-video',
        kind: 'video',
        index: 0,
        clips: [makeClip({ id: 'clip-a', assetId: RUSH.id, start: 0, duration: 4 * SECOND })],
      }),
    ],
  }
}

beforeEach(() => {
  installFakeBridge({ assets: { search: vi.fn(async () => [RUSH]) } })
  withMontage(laid())
})

/**
 * The montage lives in `engines/timeline`, which `shared/` may not import, so its kinds, its edges
 * and its bounds are written out by hand in the registry. This is what holds the copies to their
 * originals, and it has to live on this side of the boundary for the same reason.
 */
describe('what the registry offers a montage', () => {
  const fieldOf = (name: ActionName, key: string) =>
    assistantAction(name)?.fields.find(field => field.key === key)

  it('is exactly what the engine declares', () => {
    expect([...(fieldOf('track.add', 'kind')?.options ?? [])].sort()).toEqual(
      [...TRACK_KINDS].sort(),
    )
    expect([...(fieldOf('clip.trim', 'edge')?.options ?? [])].sort()).toEqual(
      [...CLIP_EDGES].sort(),
    )
    expect(fieldOf('clip.gain', 'gain')).toMatchObject({ min: MIN_GAIN_DB, max: MAX_GAIN_DB })
    expect(fieldOf('clip.speed', 'speed')).toMatchObject({ min: MIN_SPEED, max: MAX_SPEED })
  })
})

describe('reading the montage in front', () => {
  it('answers its settings, its head and every clip of every track', async () => {
    const outcome = await runAction('sequence.state', {})

    expect(outcome).toMatchObject({
      ok: true,
      data: { documentId: DOCUMENT, playhead: 0, duration: 4 * SECOND },
    })
    const read = outcome.ok ? (outcome.data as { tracks: { clips: { id: string }[] }[] }) : null
    expect(read?.tracks[0]?.clips.map(clip => clip.id)).toEqual(['clip-a'])
  })

  /**
   * The rule `command.runStudioCommand` already follows, and the reason the family names no document: it speaks
   * to the montage in front, whichever workspace shows it.
   */
  it('refuses every action of the family while no montage is in front', async () => {
    useDocuments.setState({ documents: {}, activeId: null })

    expect(await runAction('sequence.state', {})).toMatchObject({
      ok: false,
      refusal: 'wrongSurface',
    })
    expect(await runAction('clip.remove', { clipId: 'clip-a' })).toMatchObject({
      ok: false,
      refusal: 'wrongSurface',
    })
  })
})

describe('laying clips down', () => {
  it('lays an asset at the instant asked for and answers the clips it became', async () => {
    const outcome = await runAction('clip.add', { assetId: RUSH.id, start: 6 * SECOND })
    const laidIds = outcome.ok ? (outcome.data as { clipIds: string[] }).clipIds : []

    expect(laidIds).toHaveLength(1)
    expect(clipIds()).toHaveLength(2)
    expect(sequence().tracks[0]?.clips.at(-1)?.start).toBe(6 * SECOND)
  })

  // What a drop does when nothing on the strip would take it: open the row it needs.
  it('opens a row when every one that could take the clip refuses it', async () => {
    withMontage({
      ...EMPTY_SEQUENCE,
      tracks: [makeTrack({ id: 'track-video', kind: 'video', index: 0, locked: true })],
    })

    expect(await runAction('clip.add', { assetId: RUSH.id })).toMatchObject({ ok: true })
    expect(sequence().tracks).toHaveLength(2)
    expect(clipIds()).toHaveLength(1)
  })

  /**
   * A picture row is never OPENED on a montage that has none — that is what keeps a rush out of
   * the Audio workspace. Nothing is laid, and saying so beats reporting a clip nobody can see.
   */
  it('refuses a rush a sound montage would have nowhere to show', async () => {
    withMontage({
      ...EMPTY_SEQUENCE,
      tracks: [makeTrack({ id: 'A1', kind: 'audio', index: 0 })],
    })

    expect(await runAction('clip.add', { assetId: RUSH.id })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    expect(clipIds()).toEqual([])
  })

  // The catalogue answers nothing for an id it does not hold, and a clip of nothing paints nothing.
  it('refuses an asset the library does not hold', async () => {
    installFakeBridge({ assets: { search: vi.fn(async () => []) } })

    expect(await runAction('clip.add', { assetId: 'asset-z' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
    expect(clipIds()).toEqual(['clip-a'])
  })
})

describe('editing a clip', () => {
  it('moves, trims, splits and fades by id', async () => {
    await runAction('clip.move', { clipId: 'clip-a', trackId: 'track-video', start: 2 * SECOND })
    expect(sequence().tracks[0]?.clips[0]?.start).toBe(2 * SECOND)

    await runAction('clip.split', { clipId: 'clip-a', at: 4 * SECOND })
    expect(clipIds()).toHaveLength(2)

    await runAction('clip.fade', { clipId: 'clip-a', edge: 'in', length: SECOND })
    expect(sequence().tracks[0]?.clips[0]?.fadeIn).toBe(SECOND)
  })

  it('sets the level and the speed of a clip', async () => {
    await runAction('clip.gain', { clipId: 'clip-a', gain: -6 })
    await runAction('clip.speed', { clipId: 'clip-a', speed: 2 })

    expect(sequence().tracks[0]?.clips[0]).toMatchObject({ gain: -6, speed: 2 })
  })

  /**
   * A command whose clip is gone answers by returning the state untouched, so without the lookup
   * every miss would be reported as done — the same reason the layer family looks its id up first.
   */
  it('refuses a clip the montage does not hold rather than reporting a no-op as done', async () => {
    expect(await runAction('clip.gain', { clipId: 'clip-z', gain: -6 })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
  })

  // Outside the clip there is nothing to cut, and `splitClip` says so by changing nothing.
  it('refuses a cut that falls outside the clip', async () => {
    expect(await runAction('clip.split', { clipId: 'clip-a', at: 9 * SECOND })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    expect(clipIds()).toEqual(['clip-a'])
  })

  it('refuses a move onto a track the montage does not hold', async () => {
    expect(
      await runAction('clip.move', { clipId: 'clip-a', trackId: 'track-z', start: 0 }),
    ).toMatchObject({ ok: false, refusal: 'badInput' })
    expect(sequence().tracks[0]?.clips[0]?.start).toBe(0)
  })

  it('trims to the media behind the clip, and no further, and answers where it now stands', async () => {
    // Four seconds of source is all there is to show, whatever the edge was pulled to.
    expect(await runAction('clip.trim', { clipId: 'clip-a', edge: 'out', at: 9 * SECOND })).toEqual(
      { ok: true, data: { start: 0, end: 4 * SECOND } },
    )
    expect(sequence().tracks[0]?.clips[0]?.duration).toBe(4 * SECOND)
  })

  /** What a write ANSWERS: where the clip now sits, or the one dial it turned — never the clip. */
  it('answers a move by the span, a fade by its ramp and a gain by its level', async () => {
    expect(
      await runAction('clip.move', { clipId: 'clip-a', trackId: 'track-video', start: 2 * SECOND }),
    ).toEqual({ ok: true, data: { start: 2 * SECOND, end: 6 * SECOND } })
    expect(await runAction('clip.fade', { clipId: 'clip-a', edge: 'out', length: SECOND })).toEqual(
      { ok: true, data: { fadeOut: SECOND } },
    )
    expect(await runAction('clip.gain', { clipId: 'clip-a', gain: -60 })).toEqual({
      ok: true,
      data: { gain: MIN_GAIN_DB },
    })
  })
})

describe('the tracks', () => {
  it('adds, renames, reorders and removes a row', async () => {
    await runAction('track.add', { kind: 'audio' })
    expect(sequence().tracks.map(track => track.kind)).toEqual(['video', 'audio'])

    await runAction('track.rename', { trackId: 'track-video', name: 'Plans' })
    expect(sequence().tracks[0]?.name).toBe('Plans')

    await runAction('track.remove', { trackId: 'track-video' })
    expect(sequence().tracks.map(track => track.kind)).toEqual(['audio'])
  })

  /**
   * Mute, solo, lock and height say how one works rather than what one made, so they go through
   * `writeTrack` and never enter the history — exactly as the header column writes them.
   */
  it('sets the four dials of a row without touching the undo stack', async () => {
    await runAction('track.setMuteSoloLockHeight', {
      trackId: 'track-video',
      muted: true,
      height: 120,
    })

    expect(sequence().tracks[0]).toMatchObject({ muted: true, height: 120 })
    expect(sequenceHistoryOf(useSequences.getState(), DOCUMENT).past).toEqual([])
  })
})

describe('the playhead and the selection', () => {
  it('places the head, and never past the end of the montage', async () => {
    await runAction('sequence.seek', { time: 2 * SECOND })
    expect(sequence().playhead).toBe(2 * SECOND)

    await runAction('sequence.seek', { time: 99 * SECOND })
    expect(sequence().playhead).toBe(4 * SECOND)
  })

  it('points at a clip, and refuses one the montage lost', async () => {
    expect(await runAction('clip.select', { clipId: 'clip-a' })).toEqual({ ok: true })
    expect(sequence().selectedId).toBe('clip-a')

    expect(await runAction('clip.select', { clipId: 'clip-z' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
  })
})
