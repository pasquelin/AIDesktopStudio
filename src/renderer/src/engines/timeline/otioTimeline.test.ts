import { describe, expect, it } from 'vitest'
import { STUDIO_METADATA_KEY } from '@shared/domain/document'
import { type OtioClip, type OtioTimeline, type OtioTrackItem } from '@shared/domain/otio'
import { montageHoldsMore, otioTimelineOf, sequenceFromOtio, type OtioSource } from './otioTimeline'
import { clipFixture, sequenceWith, trackFixture } from './timeline-fixtures'
import {
  DEFAULT_SETTINGS,
  makeClip,
  makeTrack,
  reindexTracks,
  SECOND,
  type Clip,
  type SequenceState,
} from './timelineState'

const named = (clip: Clip): OtioSource => ({
  name: clip.assetId,
  url: `file:///project/assets/${clip.assetId}.mp4`,
})

const write = (state: SequenceState, sourceOf: (clip: Clip) => OtioSource = named): OtioTimeline =>
  otioTimelineOf(state, { name: 'Montage', sourceOf })

const itemsOf = (timeline: OtioTimeline, track: number): readonly OtioTrackItem[] =>
  timeline.tracks.children[track]?.children ?? []

const clipsOnly = (items: readonly OtioTrackItem[]): OtioClip[] =>
  items.filter((item): item is OtioClip => item.OTIO_SCHEMA === 'Clip.1')

/** The same montage with its clip ids blanked, for a comparison identity is not part of. */
const anonymous = (state: SequenceState): SequenceState => ({
  ...state,
  tracks: state.tracks.map(track => ({
    ...track,
    clips: track.clips.map(clip => ({ ...clip, id: '' })),
  })),
})

describe('otioTimelineOf', () => {
  it('writes the tracks bottom first, which is the opposite of the studio order', () => {
    const timeline = write(
      sequenceWith(
        reindexTracks([
          trackFixture('V1', 'video', [clipFixture('a', 0, SECOND)]),
          trackFixture('A1', 'audio', [clipFixture('b', 0, SECOND)]),
        ]),
      ),
    )

    expect(timeline.OTIO_SCHEMA).toBe('Timeline.1')
    expect(timeline.tracks.OTIO_SCHEMA).toBe('Stack.1')
    expect(timeline.tracks.children.map(track => track.kind)).toEqual(['Audio', 'Video'])
  })

  it('fills the hole before a clip with a gap, so the track stays contiguous', () => {
    const timeline = write(
      sequenceWith([trackFixture('V1', 'video', [clipFixture('a', 2 * SECOND, SECOND)])]),
    )

    const [gap, clip] = itemsOf(timeline, 0)
    expect(gap?.OTIO_SCHEMA).toBe('Gap.1')
    // 25 fps: two seconds of silence, then one second of picture.
    expect(gap?.source_range.duration.value).toBe(50)
    expect(clip?.source_range.duration.value).toBe(25)
    expect(clip?.source_range.duration.rate).toBe(25)
  })

  it('writes a trim as the source range and a speed as a linear time warp', () => {
    const timeline = write(
      sequenceWith([
        trackFixture('V1', 'video', [
          clipFixture('a', 0, SECOND, { inPoint: 4 * SECOND, speed: 2 }),
        ]),
      ]),
    )

    const [clip] = clipsOnly(itemsOf(timeline, 0))
    expect(clip?.source_range.start_time.value).toBe(100)
    expect(clip?.effects).toEqual([
      {
        OTIO_SCHEMA: 'LinearTimeWarp.1',
        name: '',
        metadata: {},
        effect_name: 'LinearTimeWarp',
        time_scalar: 2,
      },
    ])
  })

  it('points a clip at its media, and says the media is missing when there is no file', () => {
    const timeline = write(
      sequenceWith([
        trackFixture('V1', 'video', [
          clipFixture('a', 0, SECOND),
          clipFixture('b', SECOND, SECOND),
        ]),
      ]),
      clip => (clip.assetId === 'asset-a' ? named(clip) : { name: 'remote', url: null }),
    )

    const [first, second] = clipsOnly(itemsOf(timeline, 0))
    expect(first?.media_reference).toMatchObject({
      OTIO_SCHEMA: 'ExternalReference.1',
      target_url: 'file:///project/assets/asset-a.mp4',
    })
    expect(second?.media_reference.OTIO_SCHEMA).toBe('MissingReference.1')
  })

  it('writes a live scene as a missing reference, keeping its place and its length', () => {
    const timeline = write(
      sequenceWith([
        trackFixture('V1', 'video', [
          makeClip({ id: 'a', assetId: '', sceneId: 'scene-7', start: SECOND, duration: SECOND }),
        ]),
      ]),
      () => ({ name: 'Niveau', url: 'file:///should/not/be/used.mp4' }),
    )

    const [clip] = clipsOnly(itemsOf(timeline, 0))
    expect(clip?.media_reference.OTIO_SCHEMA).toBe('MissingReference.1')
    expect(clip?.name).toBe('Niveau')
    expect(clip?.source_range.duration.value).toBe(25)
  })

  it('disables a track that does not reach the output, whether muted or outsoloed', () => {
    const timeline = write(
      sequenceWith(
        reindexTracks([
          trackFixture('V1', 'video', [clipFixture('a', 0, SECOND)], { solo: true }),
          trackFixture('V2', 'video', [clipFixture('b', 0, SECOND)]),
          trackFixture('A1', 'audio', [clipFixture('c', 0, SECOND)], { muted: true }),
        ]),
      ),
    )

    // Bottom first: A1 muted, V2 silenced by V1's solo, V1 through.
    expect(timeline.tracks.children.map(track => track.enabled)).toEqual([false, false, true])
  })
})

/** Two tracks, a fade, a speed change and a link — read back by one suite, guarded by the other. */
const montage: SequenceState = {
  settings: { width: 1280, height: 720, fps: 30, sampleRate: 44_100 },
  tracks: reindexTracks([
    trackFixture(
      'V1',
      'video',
      [
        clipFixture('a', 0, 2 * SECOND, { fadeIn: 200_000, linkId: 'take-1' }),
        clipFixture('b', 3 * SECOND, SECOND, { inPoint: 5 * SECOND, speed: 0.5 }),
      ],
      { name: 'Plans', height: 90, locked: true },
    ),
    trackFixture('A1', 'audio', [clipFixture('c', 0, 2 * SECOND, { gain: -6, linkId: 'take-1' })], {
      muted: true,
    }),
  ]),
  selectedId: 'b',
  selectedTrackId: null,
  playhead: 1_500_000,
}

describe('sequenceFromOtio', () => {
  it('reads back everything the studio put in, standard or extended', () => {
    expect(sequenceFromOtio(write(montage))).toEqual(montage)
  })

  // The other half of what a montage designates: a file written before a row could be
  // designated carries no `selectedTrackId`, and still reads its clip back.
  it('reads back a designated row beside the designated clip', () => {
    const onTrack: SequenceState = { ...montage, selectedTrackId: 'A1' }
    expect(sequenceFromOtio(write(onTrack)).selectedTrackId).toBe('A1')
  })

  // Nothing may designate nothing: a row named by a file that no longer holds it is dropped,
  // exactly as a clip the read discarded is.
  it('forgets a row the file names and the read does not hold', () => {
    expect(
      sequenceFromOtio(write({ ...montage, selectedTrackId: 'A9' })).selectedTrackId,
    ).toBeNull()
  })

  it('carries a live scene clip through the round trip', () => {
    const scene = sequenceWith(
      reindexTracks([
        trackFixture('V1', 'video', [
          makeClip({ id: 'a', assetId: '', sceneId: 'scene-7', start: 0, duration: SECOND }),
        ]),
      ]),
    )

    expect(sequenceFromOtio(write(scene))).toEqual(scene)
  })

  it('reads a file written elsewhere, given something to relink its media with', () => {
    const foreign = JSON.parse(
      JSON.stringify(
        write(
          sequenceWith(
            reindexTracks([
              trackFixture('V1', 'video', [
                clipFixture('a', 2 * SECOND, SECOND, { inPoint: SECOND }),
              ]),
            ]),
          ),
        ),
      ).replaceAll(`"${STUDIO_METADATA_KEY}"`, '"someone_else"'),
    )

    const state = sequenceFromOtio(foreign, () => ({ assetId: 'relinked', sceneId: '' }))
    const [clip] = state.tracks[0]?.clips ?? []
    expect(state.tracks).toHaveLength(1)
    expect(clip).toMatchObject({
      assetId: 'relinked',
      start: 2 * SECOND,
      duration: SECOND,
      inPoint: SECOND,
    })
  })

  it('drops a clip whose media nothing can name, rather than inventing a catalogue row', () => {
    const foreign = JSON.parse(
      JSON.stringify(
        write(sequenceWith([trackFixture('V1', 'video', [clipFixture('a', 0, SECOND)])])),
      ).replaceAll(`"${STUDIO_METADATA_KEY}"`, '"someone_else"'),
    )

    expect(sequenceFromOtio(foreign).tracks[0]?.clips).toEqual([])
  })

  /**
   * What ANOTHER application sees: the same file with the `aidesktopstudio` domain of its metadata gone.
   * The one measurement behind `capabilityOf('otio')` — and the reason « no loss » is never said
   * without saying to whom.
   *
   * Clip ids are blanked on both sides: identity rides in the metadata this drops, and a fresh
   * one is minted for a clip read without it.
   */
})

function richSequence(): SequenceState {
  return {
    settings: { width: 1280, height: 720, fps: 25, sampleRate: 44_100 },
    tracks: reindexTracks([
      trackFixture(
        'V1',
        'video',
        [
          // One microsecond off the frame grid, which is what makes `exactTime` visible.
          clipFixture('a', 0, 2 * SECOND, { inPoint: SECOND + 1, fadeIn: 200_000, linkId: 'x' }),
          clipFixture('b', 3 * SECOND, SECOND, { speed: 0.5 }),
        ],
        { name: 'Plans', height: 90, locked: true, solo: true },
      ),
      trackFixture('A1', 'audio', [clipFixture('c', 0, 2 * SECOND, { gain: -6, linkId: 'x' })], {
        muted: true,
      }),
    ]),
    selectedId: 'b',
    selectedTrackId: null,
    playhead: 1_500_000,
  }
}

function plainSequence(): SequenceState {
  return {
    settings: DEFAULT_SETTINGS,
    tracks: reindexTracks([
      makeTrack({
        id: 'V1',
        kind: 'video',
        index: 0,
        name: 'Plans',
        clips: [
          makeClip({
            id: 'a',
            assetId: 'asset-a',
            start: 0,
            duration: 2 * SECOND,
            inPoint: SECOND,
          }),
          makeClip({
            id: 'b',
            assetId: 'asset-b',
            start: 3 * SECOND,
            duration: SECOND,
            speed: 0.5,
          }),
        ],
      }),
      makeTrack({
        id: 'A1',
        kind: 'audio',
        index: 0,
        muted: true,
        clips: [makeClip({ id: 'c', assetId: 'asset-c', start: 0, duration: 2 * SECOND })],
      }),
    ]),
    selectedId: null,
    selectedTrackId: null,
    playhead: 0,
  }
}

describe('sequenceFromOtio without studio metadata', () => {
  it('shows the cut and nothing else once the studio metadata is gone', () => {
    const rich = richSequence()

    const stripped = JSON.parse(
      JSON.stringify(write(rich)).replaceAll(`"${STUDIO_METADATA_KEY}"`, '"someone_else"'),
    )

    expect(
      anonymous(
        sequenceFromOtio(stripped, ({ targetUrl }) => ({
          assetId: targetUrl.slice(targetUrl.lastIndexOf('/') + 1, -4),
          sceneId: '',
        })),
      ),
    ).toEqual(anonymous(plainSequence()))
  })

  // The standard part is what another application edits; the metadata only remembers.
})

describe('sequenceFromOtio interoperability', () => {
  it('takes a mute made elsewhere over the switches the metadata still remembers', () => {
    const heard = sequenceWith(
      reindexTracks([trackFixture('A1', 'audio', [clipFixture('a', 0, SECOND)])]),
    )
    const timeline = write(heard)
    const silenced = {
      ...timeline,
      tracks: {
        ...timeline.tracks,
        children: timeline.tracks.children.map(track => ({ ...track, enabled: false })),
      },
    }

    expect(sequenceFromOtio(timeline).tracks[0]?.muted).toBe(false)
    expect(sequenceFromOtio(silenced).tracks[0]?.muted).toBe(true)
  })

  it('opens an empty sequence on anything that is not an OTIO timeline', () => {
    expect(sequenceFromOtio({ tracks: [] }).tracks).toHaveLength(2)
    expect(sequenceFromOtio('not json at all').tracks).toHaveLength(2)
  })
})

const written = (): Record<string, unknown> =>
  JSON.parse(JSON.stringify(write(montage))) as Record<string, unknown>

const stackWith = (over: Record<string, unknown>): Record<string, unknown> => ({
  ...written(),
  tracks: { ...(written().tracks as Record<string, unknown>), ...over },
})

function trackWith(over: Record<string, unknown>): Record<string, unknown> {
  const stack = written().tracks as Record<string, unknown>
  const tracks = stack.children as Record<string, unknown>[]
  return stackWith({ children: [{ ...tracks[0], ...over }, ...tracks.slice(1)] })
}

const marker = { OTIO_SCHEMA: 'Marker.2', name: 'Repère', color: 'RED' }

/** Each case asserts WHICH member was found — `gltfDocument.test.ts` says what that costs. */
describe('montageHoldsMore', () => {
  it('finds nothing in a montage the studio wrote itself', () => {
    expect(montageHoldsMore(written())).toEqual([])
  })

  it('names a root member no save writes back', () => {
    expect(montageHoldsMore({ ...written(), tracks_v2: [] })).toEqual(['tracks_v2'])
  })

  it('names the domain another application put beside the studio own', () => {
    const held = written()
    const foreign = {
      ...held,
      metadata: { ...(held.metadata as object), resolve: { projectId: '42' } },
    }

    expect(montageHoldsMore(foreign)).toEqual(['metadata.resolve'])
  })

  it('names the markers a stack holds', () => {
    expect(montageHoldsMore(stackWith({ markers: [marker] }))).toEqual(['markers'])
  })

  it('names the effects a stack holds', () => {
    const graded = stackWith({ effects: [{ OTIO_SCHEMA: 'Effect.1', effect_name: 'ocio' }] })

    expect(montageHoldsMore(graded)).toEqual(['effects'])
  })

  it('names the markers a track holds', () => {
    expect(montageHoldsMore(trackWith({ markers: [marker] }))).toEqual(['markers'])
  })

  /** A TRACK's `enabled` is composed — it is the result of its mute and its solo, written back. */
  it('says nothing about a track a mute has disabled', () => {
    expect(montageHoldsMore(trackWith({ enabled: false }))).toEqual([])
  })

  it('names a clip another application turned off', () => {
    const stack = written().tracks as Record<string, unknown>
    const tracks = stack.children as Record<string, unknown>[]
    const items = (tracks[0]?.children as Record<string, unknown>[]) ?? []
    const off = trackWith({ children: [{ ...items[0], enabled: false }, ...items.slice(1)] })

    expect(montageHoldsMore(off)).toEqual(['enabled'])
  })
})

describe('montageHoldsMore ranges and foreign items', () => {
  it('names the range a track holds, which a save writes null', () => {
    const trimmed = trackWith({
      source_range: { OTIO_SCHEMA: 'TimeRange.1', start_time: null, duration: null },
    })

    expect(montageHoldsMore(trimmed)).toEqual(['source_range'])
  })

  /**
   * A clip's and a GAP's own range are composed, so neither may be reported — a gap carries one
   * too, and reporting it refused every montage holding a hole between two clips.
   */
  it('says nothing about the ranges a clip and a gap carry', () => {
    const tracks = (written().tracks as { children: Record<string, unknown>[] }).children
    const schemas = tracks.flatMap(track =>
      ((track.children as Record<string, unknown>[]) ?? []).map(one => one.OTIO_SCHEMA),
    )

    expect(schemas).toContain('Gap.1')
    expect(montageHoldsMore(written())).toEqual([])
  })

  it('names the schema of an item a track holds that is neither a clip nor a gap', () => {
    const stack = written().tracks as Record<string, unknown>
    const tracks = stack.children as Record<string, unknown>[]
    const cut = trackWith({
      children: [
        ...((tracks[0]?.children as unknown[]) ?? []),
        { OTIO_SCHEMA: 'Transition.1', name: 'Fondu' },
      ],
    })

    expect(montageHoldsMore(cut)).toEqual(['Transition.1'])
  })

  it('names the markers a clip holds', () => {
    const stack = written().tracks as Record<string, unknown>
    const tracks = stack.children as Record<string, unknown>[]
    const items = (tracks[0]?.children as Record<string, unknown>[]) ?? []
    const flagged = trackWith({ children: [{ ...items[0], markers: [marker] }, ...items.slice(1)] })

    expect(montageHoldsMore(flagged)).toEqual(['markers'])
  })

  /** The studio's own speed change, and the one effect that must stay silent. */
  it('says nothing about the time warp a clip at another speed carries', () => {
    expect(clipsOnly(itemsOf(write(montage), 1))[1]?.effects).toHaveLength(1)
    expect(montageHoldsMore(written())).toEqual([])
  })

  it('answers nothing at all for a payload that is not an OTIO timeline', () => {
    expect(montageHoldsMore({ tracks: {}, markers: [marker] })).toEqual([])
  })

  /**
   * The names come from the FILE, so a montage where every clip carries its own foreign domain
   * would otherwise build a set as long as the montage and push the join of it into a sentence.
   */
  it('stops naming once it has said enough, on a montage that holds a domain per clip', () => {
    const stack = written().tracks as Record<string, unknown>
    const tracks = stack.children as Record<string, unknown>[]
    const items = Array.from({ length: 200 }, (_unused, index) => ({
      OTIO_SCHEMA: 'Clip.1',
      metadata: { [`domain-${index}`]: {} },
    }))

    const held = montageHoldsMore(stackWith({ children: [{ ...tracks[0], children: items }] }))

    expect(held.length).toBeLessThanOrEqual(8)
    expect(held[0]).toBe('metadata.domain-0')
  })
})
