import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import type { IngestProgress, IngestStage } from '@shared/domain/media'
import { installFakeBridge } from '@/services/fakeBridge'
import { useAssets } from './assets'
import { useMedia } from './media'

const importedMedia = vi.hoisted(() => ({
  notices: vi.fn(),
  convert: vi.fn(async (assets: readonly Asset[]) => assets),
  failure: vi.fn(),
}))
vi.mock('@/services/externalFiles', () => ({ reportImportNotices: importedMedia.notices }))
vi.mock('@/services/meshConversion', () => ({ convertArrivedModels: importedMedia.convert }))
vi.mock('@/services/diagnostics', () => ({ reportFailure: importedMedia.failure }))

const asset = (id: string): Asset => ({
  id,
  name: id,
  type: 'video',
  location: 'local',
  tags: [],
  createdAt: '2026-08-07T10:00:00.000Z',
  sourcePath: `/rushes/${id}.mov`,
})

const progress = (assetId: string, stage: IngestProgress['stage']): IngestProgress => ({
  assetId,
  stage,
  ratio: 0.5,
})

describe('media store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMedia.setState({ progress: {}, capabilities: { ffmpeg: true } })
    useAssets.setState({ items: [] })
  })

  it('shows the imported assets at once, without waiting for their ingest', async () => {
    const refresh = vi.fn(async () => undefined)
    useAssets.setState({ refresh })
    installFakeBridge({
      media: {
        ingest: () =>
          Promise.resolve({
            assets: [asset('a'), asset('b')],
            documents: [],
            montages: [],
            refused: [],
            failed: [],
          }),
      },
    })

    await useMedia.getState().importMedia()

    expect(refresh).toHaveBeenCalledOnce()
  })

  it('reports picker failures and converts copied 3D assets before returning', async () => {
    const mesh: Asset = { ...asset('robot'), type: 'mesh', path: 'Models/robot.fbx' }
    const imported = {
      assets: [mesh],
      documents: [],
      montages: [],
      refused: [{ name: 'bad.fbx', extension: 'fbx' }],
      failed: ['missing.png'],
    }
    installFakeBridge({ media: { ingest: () => Promise.resolve(imported) } })

    await useMedia.getState().importMedia()

    expect(importedMedia.notices).toHaveBeenCalledWith(imported)
    expect(importedMedia.convert).toHaveBeenCalledWith([mesh])
  })

  it('reports a picker failure instead of swallowing it', async () => {
    installFakeBridge({
      media: { ingest: () => Promise.reject(new Error('picker unavailable')) },
    })

    await useMedia.getState().importMedia()

    expect(importedMedia.failure).toHaveBeenCalledWith(
      'assets.copy',
      'media-picker',
      expect.any(Error),
    )
  })

  it('follows an ingest through its stages', () => {
    useMedia.getState().apply(progress('a', 'proxy'))
    expect(useMedia.getState().progress['a']).toMatchObject({ stage: 'proxy' })
  })

  it('refreshes the browser when an ingest lands, which is when the duration is known', async () => {
    vi.useFakeTimers()
    const refresh = vi.fn(async () => undefined)
    useAssets.setState({ refresh })

    useMedia.getState().apply(progress('a', 'done'))
    await vi.runAllTimersAsync()

    expect(refresh).toHaveBeenCalledOnce()
    // Kept out of the map once finished: a bar that never leaves is a bar nobody reads.
    expect(useMedia.getState().progress['a']).toBeUndefined()
    vi.useRealTimers()
  })

  it('reads the catalogue once for a batch, not once per file that lands', async () => {
    vi.useFakeTimers()
    const refresh = vi.fn(async () => undefined)
    useAssets.setState({ refresh })

    // Forty rushes finishing would otherwise be forty synchronous SQLite queries in the main.
    for (const id of ['a', 'b', 'c']) useMedia.getState().apply(progress(id, 'done'))
    await vi.runAllTimersAsync()

    expect(refresh).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('drops the row of a cancelled ingest, in every window and not only the one that asked', () => {
    useMedia.getState().apply(progress('a', 'proxy'))
    useMedia.getState().apply(progress('a', 'cancelled'))

    expect(useMedia.getState().progress['a']).toBeUndefined()
  })

  it('keeps a failure on screen, since it is the only trace an import left', () => {
    useMedia.getState().apply(progress('a', 'failed'))
    expect(useMedia.getState().progress['a']).toMatchObject({ stage: 'failed' })
  })

  it('reads what the pipeline can do, so the interface can say what is missing', async () => {
    installFakeBridge({ media: { capabilities: () => Promise.resolve({ ffmpeg: false }) } })

    const stop = await useMedia.getState().connect()

    expect(useMedia.getState().capabilities.ffmpeg).toBe(false)
    stop()
  })

  it('drops the progress of an ingest it cancelled', async () => {
    const cancel = vi.fn(() => Promise.resolve())
    installFakeBridge({ media: { cancel } })
    useMedia.getState().apply(progress('a', 'proxy'))

    await useMedia.getState().cancel('a')

    expect(cancel).toHaveBeenCalledWith('a')
    expect(useMedia.getState().progress['a']).toBeUndefined()
  })

  it('refreshes the browser on every outcome, since each one changed the catalogue', () => {
    const outcomes: IngestStage[] = ['done', 'duplicate', 'unreadable', 'failed', 'cancelled']
    for (const stage of outcomes) {
      const invalidate = vi.spyOn(useAssets.getState(), 'invalidate')
      useMedia.getState().apply({ assetId: 'asset-1', stage, ratio: 1 })
      expect(invalidate, stage).toHaveBeenCalled()
      invalidate.mockRestore()
    }
  })

  // The row was minted optimistically by the import and the main process has since dropped it.
  it('keeps a duplicate on screen, and takes a finished file off', () => {
    useMedia.getState().apply({ assetId: 'asset-1', stage: 'duplicate', ratio: 1 })
    expect(useMedia.getState().progress['asset-1']?.stage).toBe('duplicate')

    useMedia.getState().apply({ assetId: 'asset-2', stage: 'done', ratio: 1 })
    expect(useMedia.getState().progress['asset-2']).toBeUndefined()
  })
})
