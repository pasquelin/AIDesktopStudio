import { describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import type { SceneStage, SceneStageOptions } from '../scene/sceneStage'
import { clipForScene, trackForScene } from './insert'
import { createStudioSink } from './sinkPort'
import {
  clipSource,
  DEFAULT_SETTINGS,
  EMPTY_SEQUENCE,
  EMPTY_SOUND_SEQUENCE,
  makeClip,
  sceneIdOfSource,
} from './timelineState'
import { parseSequence } from './timelineParsing'

const SETTINGS = DEFAULT_SETTINGS

const asset = (overrides: Partial<Asset> = {}): Asset => ({
  id: 'asset_3',
  name: 'Robot',
  type: 'mesh',
  location: 'local',
  tags: [],
  createdAt: '2026-08-16T10:00:00.000Z',
  ...overrides,
})

describe('a clip that draws a scene', () => {
  it('is told apart from an asset clip by its source key', () => {
    const scene = makeClip({ id: 'c1', assetId: '', sceneId: 'doc-7', start: 0, duration: 1 })
    const asset = makeClip({ id: 'c2', assetId: 'asset_9', start: 0, duration: 1 })

    expect(sceneIdOfSource(clipSource(scene))).toBe('doc-7')
    expect(sceneIdOfSource(clipSource(asset))).toBeNull()
    expect(clipSource(asset)).toBe('asset_9')
  })

  it('survives being written out and read back, which an empty asset id used to prevent', () => {
    const written = {
      tracks: [
        {
          id: 'V1',
          kind: 'video',
          clips: [{ id: 'c1', assetId: '', sceneId: 'doc-7', start: 0, duration: 2_000_000 }],
        },
      ],
    }

    const clip = parseSequence(written).tracks[0]?.clips[0]

    expect(clip?.sceneId).toBe('doc-7')
  })

  it('is still refused when it names neither a scene nor an asset', () => {
    const written = { tracks: [{ id: 'V1', kind: 'video', clips: [{ id: 'c1', duration: 10 }] }] }

    expect(parseSequence(written).tracks[0]?.clips).toEqual([])
  })

  it('lasts as long as the scene animation says, snapped to whole frames', () => {
    const clip = clipForScene('doc-7', 3_000_000, 0, SETTINGS)

    expect(clip.duration).toBe(3_000_000)
    expect(clip.assetId).toBe('')
  })

  it('falls back to the still-picture length for a scene with no animation yet', () => {
    expect(clipForScene('doc-7', null, 0, SETTINGS).duration).toBe(5_000_000)
    expect(clipForScene('doc-7', 0, 0, SETTINGS).duration).toBe(5_000_000)
  })

  it('lands on a picture row, and nowhere at all in a montage that paints none', () => {
    expect(trackForScene(EMPTY_SEQUENCE)?.kind).toBe('video')
    expect(trackForScene(EMPTY_SOUND_SEQUENCE)).toBeNull()
  })
})

describe('createStudioSink', () => {
  const stage: SceneStage = { show: vi.fn(), draw: vi.fn(() => null), dispose: vi.fn() }

  function sinkFor(source: string, asset: Asset | null = null) {
    const wantScene = vi.fn()
    // The parameter is spelled out so the recorded calls keep their type: an argless mock
    // records an empty tuple, and reading its first argument would not compile.
    const createStage = vi.fn((_options: SceneStageOptions) => stage)
    const open = createStudioSink({
      sceneOf: () => null,
      wantScene,
      viewOf: () => null,
      assetOf: () => asset,
      size: () => ({ width: 1920, height: 1080 }),
      createStage,
    })
    // Swallowed: the media path reaches for bytes jsdom cannot fetch, and this suite is about
    // WHICH path was taken, never about what the media one comes back with.
    return { open: open(source).catch(() => null), wantScene, createStage }
  }

  it('opens a scene source as 3D, and asks for the document it names', async () => {
    const { open, wantScene, createStage } = sinkFor('scene:doc-7')
    await open

    expect(wantScene).toHaveBeenCalledWith('doc-7')
    // At the sequence's own size, and wired to the 3D tab's camera: a scene with no camera of
    // its own is drawn through the view its author is working in.
    const options = createStage.mock.calls[0]?.[0]
    expect(options).toMatchObject({ width: 1920, height: 1080 })
    expect(options).toHaveProperty('viewOf')
  })

  it('opens a mesh asset as 3D too, so a model needs no scene built around it first', async () => {
    const { open, createStage } = sinkFor('asset_3', asset())
    await open

    expect(createStage).toHaveBeenCalled()
    // Wired for the clips the file brings: that is what plays an animated model.
    expect(createStage.mock.calls[0]?.[0]).toHaveProperty('onClips')
  })

  it('leaves anything else to the media path', () => {
    const { createStage } = sinkFor('asset_4', asset({ id: 'asset_4', type: 'video' }))

    expect(createStage).not.toHaveBeenCalled()
  })
})
