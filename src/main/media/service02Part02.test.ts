import { describe, expect, it, vi } from 'vitest'
import type { MediaProbe } from '@shared/domain/asset'
import type { ProbeOutcome } from './probe'
import { createMediaService, type MediaServiceDeps } from './service'

const probe: MediaProbe = {
  duration: 20_000_000,
  codec: 'prores',
  width: 3840,
  height: 2160,
  fps: 25,
  sampleRate: 48_000,
  channels: 2,
}

/** A probe that succeeded, `probe` with whatever the test needed to change. */
const probing = (fields: Partial<MediaProbe> = {}) =>
  vi.fn(async (): Promise<ProbeOutcome> => ({ kind: 'probed', probe: { ...probe, ...fields } }))

function deps(overrides: Partial<MediaServiceDeps> = {}): MediaServiceDeps {
  return {
    ffmpeg: () => '/usr/bin/ffmpeg',
    run: vi.fn(async () => Buffer.alloc(0)),
    probe: probing(),
    hash: vi.fn(async () => 'abc123'),
    computePeaks: vi.fn(async () => new Float32Array(2)),
    duplicateExists: vi.fn(async () => false),
    discard: vi.fn(async () => undefined),
    save: vi.fn(),
    writeFile: vi.fn(async () => undefined),
    onProgress: vi.fn(),
    record: vi.fn(),
    projectPath: () => '/tmp/project',
    concurrency: () => 4,
    ...overrides,
  }
}

const stages = (onProgress: unknown): string[] =>
  vi.mocked(onProgress as MediaServiceDeps['onProgress']).mock.calls.map(([event]) => event.stage)

describe('the files a generation gets beside it', () => {
  it('stops a run that was cancelled rather than finishing it in the background', async () => {
    const injected = deps()
    injected.hash = vi.fn(async () => {
      service.cancel('asset-1')
      return 'abc123'
    })
    const service = createMediaService(injected)

    await service.ingest('asset-1', '/rush.mov', 'video')

    expect(stages(injected.onProgress)).not.toContain('done')
    expect(injected.run).not.toHaveBeenCalled()
  })

  it('announces a cancellation, so every window drops the row and not only this one', async () => {
    const injected = deps()
    injected.hash = vi.fn(async () => {
      service.cancel('asset-1')
      return 'abc123'
    })
    const service = createMediaService(injected)

    await service.ingest('asset-1', '/rush.mov', 'video')
    expect(stages(injected.onProgress).at(-1)).toBe('cancelled')
  })

  it('keeps what the earlier stages found when a later one fails', async () => {
    const injected = deps({
      run: vi.fn(async () => {
        throw new Error('unsupported pixel format')
      }),
    })

    await createMediaService(injected).ingest('asset-1', '/rush.mov', 'video')

    // There is no retry, and re-picking the file makes a new row: a probe thrown away here is
    // a clip with no length, for good.
    expect(injected.save).toHaveBeenCalledWith('asset-1', {
      sourcePath: '/rush.mov',
      probe,
      hash: 'abc123',
    })
  })

  it('neither proxies nor draws a waveform for a still, which has no time in it', async () => {
    const injected = deps({
      probe: vi.fn(async (): Promise<ProbeOutcome> => ({
        kind: 'probed',
        probe: { duration: 0, codec: 'png', width: 4000, height: 3000 },
      })),
    })

    await createMediaService(injected).ingest('asset-1', '/plate.png', 'image')

    expect(stages(injected.onProgress)).toEqual(['queued', 'probe', 'hash', 'done'])
    expect(injected.run).not.toHaveBeenCalled()
  })

  it('reports the failure instead of throwing into the importer', async () => {
    const injected = deps({
      probe: vi.fn(async () => {
        throw new Error('not a media file')
      }),
    })

    await expect(
      createMediaService(injected).ingest('asset-1', '/notes.txt', 'video'),
    ).resolves.toBeUndefined()
    // A stage is announced when it starts, so the one that failed is named before the failure.
    expect(stages(injected.onProgress)).toEqual(['queued', 'probe', 'failed'])
  })

  it('imports a file it could not probe, which is what a missing ffprobe leaves', async () => {
    const injected = deps({
      probe: vi.fn(async (): Promise<ProbeOutcome> => ({ kind: 'unavailable' })),
    })

    await createMediaService(injected).ingest('asset-1', '/clip.mp4', 'video')

    expect(stages(injected.onProgress)).toEqual(['queued', 'probe', 'hash', 'done'])
    expect(injected.save).toHaveBeenCalledWith('asset-1', {
      sourcePath: '/clip.mp4',
      hash: 'abc123',
    })
  })

  it('aborts the running binary on cancel, so a twenty-minute proxy stops at once', async () => {
    const injected = deps()
    let aborted: boolean | null = null
    injected.run = vi.fn(async (_binary, _args, signal) => {
      service.cancel('asset-1')
      aborted = signal.aborted
      return Buffer.alloc(0)
    })
    const service = createMediaService(injected)

    await service.ingest('asset-1', '/rush.mov', 'video')
    expect(aborted).toBe(true)
  })

  it('runs no more ingests at once than the pool allows', async () => {
    let running = 0
    let peak = 0
    const injected = deps({
      concurrency: () => 2,
      probe: vi.fn(async (): Promise<ProbeOutcome> => {
        running += 1
        peak = Math.max(peak, running)
        await Promise.resolve()
        running -= 1
        return { kind: 'probed', probe }
      }),
    })
    const service = createMediaService(injected)

    // Six rushes picked at once would be six ffmpeg processes without the pool — CLAUDE.md § 6.
    await Promise.all(
      ['a', 'b', 'c', 'd', 'e', 'f'].map(id => service.ingest(id, `/${id}.mov`, 'video')),
    )

    expect(peak).toBeLessThanOrEqual(2)
  })

  it('cancels an ingest still waiting for its turn, without ever starting it', async () => {
    const injected = deps({ concurrency: () => 1 })
    const service = createMediaService(injected)

    const first = service.ingest('asset-1', '/a.mov', 'video')
    const second = service.ingest('asset-2', '/b.mov', 'video')
    service.cancel('asset-2')
    await Promise.all([first, second])

    expect(injected.probe).toHaveBeenCalledExactlyOnceWith('/a.mov', expect.anything())
  })

  it('refuses a file ffprobe read and would not have, whatever its extension claimed', async () => {
    const injected = deps({
      probe: vi.fn(async (): Promise<ProbeOutcome> => ({ kind: 'unreadable' })),
    })

    await createMediaService(injected).ingest('asset-1', '/notes.mp4', 'video')

    expect(stages(injected.onProgress)).toEqual(['queued', 'probe', 'unreadable'])
    // A row saying a text file is a video is worse than no row: it plays nothing, forever.
    expect(injected.discard).toHaveBeenCalledWith('asset-1')
    expect(injected.save).not.toHaveBeenCalled()
  })

  it('drops a second pick of bytes the catalogue already holds', async () => {
    const injected = deps({ duplicateExists: vi.fn(async () => true) })

    await createMediaService(injected).ingest('asset-2', '/rush.mov', 'video')

    expect(stages(injected.onProgress)).toEqual(['queued', 'probe', 'hash', 'duplicate'])
    // The row already there keeps its tags, its proxy and its waveform.
    expect(injected.discard).toHaveBeenCalledWith('asset-2')
    expect(injected.run).not.toHaveBeenCalled()
  })

  // Two picks of the same bytes in one batch: the catalogue cannot tell them apart, since a
  // row only gains its hash once its ingest ends — and both would then write the same proxy.
  it('drops the second of two identical files picked together', async () => {
    const injected = deps({ concurrency: () => 2 })
    const service = createMediaService(injected)

    await Promise.all([
      service.ingest('asset-1', '/A001.mov', 'video'),
      service.ingest('asset-2', '/A001 copy.mov', 'video'),
    ])

    expect(injected.discard).toHaveBeenCalledTimes(1)
    expect(injected.save).toHaveBeenCalledTimes(1)
  })

  it('lets the same bytes through again once the first ingest is over', async () => {
    const injected = deps()
    const service = createMediaService(injected)

    await service.ingest('asset-1', '/A001.mov', 'video')
    await service.ingest('asset-2', '/A001.mov', 'video')

    // Nothing claimed any more: only the catalogue decides now, and this one says no duplicate.
    expect(injected.discard).not.toHaveBeenCalled()
  })

  it('leaves an audio-less file without peaks', async () => {
    const injected = deps({
      probe: vi.fn(async (): Promise<ProbeOutcome> => ({
        kind: 'probed',
        probe: { duration: 1, codec: 'avc1', height: 720 },
      })),
    })

    await createMediaService(injected).ingest('asset-1', '/silent.mp4', 'video')

    expect(stages(injected.onProgress)).toEqual(['queued', 'probe', 'hash', 'done'])
  })
})

/**
 * A twenty-minute rush is prepared while the user works elsewhere: the progress row is gone by
 * the time it ends, and a file that never arrived was a silence nobody could explain.
 */
