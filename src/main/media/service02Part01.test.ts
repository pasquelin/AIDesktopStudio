import { describe, expect, it, vi } from 'vitest'
import type { MediaProbe } from '@shared/domain/asset'
import type { ProbeOutcome } from './probe'
import { createMediaService, type DeriveRequest, type MediaServiceDeps } from './service'

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
  const request: DeriveRequest = {
    assetId: 'asset-1',
    path: '/project/assets/vid/asset-1.mp4',
    kind: 'video',
    probe: { ...probe, codec: 'avc1', height: 1080 },
    poster: false,
    announce: true,
  }

  it('writes the waveform its sound clip is drawn from, and the hash a relink finds it by', async () => {
    const injected = deps()
    await createMediaService(injected).derive(request)

    expect(injected.save).toHaveBeenCalledWith('asset-1', {
      hash: 'abc123',
      peaksPath: '.index/peaks/abc123.bin',
    })
  })

  it('encodes a proxy when the window cannot decode what the API produced', async () => {
    const injected = deps()
    await createMediaService(injected).derive({ ...request, probe })

    expect(vi.mocked(injected.save).mock.calls[0]?.[1]).toMatchObject({
      proxyPath: '.index/proxies/abc123.mp4',
    })
  })

  // The library sent one down with the bytes: a frame grabbed here would overwrite a picture
  // chosen by whoever produced the model.
  it('leaves the still alone when one came down with the bytes', async () => {
    const injected = deps()
    await createMediaService(injected).derive(request)

    const args = vi.mocked(injected.run).mock.calls.map(([, given]) => given)
    expect(args.some(given => given.includes('-frames:v'))).toBe(false)
  })

  // The row stands for an asset the account holds. A proxy that failed is a take that plays
  // without one, never a take that is gone — where a picked file that turns out not to be
  // media has its row dropped.
  it('keeps the row when ffmpeg fails, unlike a file that was picked', async () => {
    const injected = deps({ run: vi.fn(async () => Promise.reject(new Error('broken'))) })
    await createMediaService(injected).derive({ ...request, probe })

    expect(injected.discard).not.toHaveBeenCalled()
    expect(injected.save).toHaveBeenCalledWith('asset-1', { hash: 'abc123' })
  })

  /** Two rows of the same bytes would both write `.index/proxies/abc123.mp4` at once. */
  it('does not write the same proxy from two derivations of the same bytes at once', async () => {
    const injected = deps()
    let inflight = 0
    let maxInflight = 0
    injected.run = vi.fn(async () => {
      inflight += 1
      maxInflight = Math.max(maxInflight, inflight)
      await new Promise(resolve => setTimeout(resolve, 15))
      inflight -= 1
      return Buffer.alloc(0)
    })

    const service = createMediaService(injected)
    await Promise.all([
      service.derive({ ...request, assetId: 'asset-1', probe }),
      service.derive({ ...request, assetId: 'asset-2', probe }),
    ])

    expect(maxInflight).toBe(1)
  })

  it('supersedes a derivation of the same asset still on its way', async () => {
    const injected = deps()
    let releaseHash = (): void => {}
    injected.hash = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<string>(resolve => (releaseHash = () => resolve('abc123'))),
      )
      .mockImplementation(async () => 'abc123')

    const service = createMediaService(injected)
    const first = service.derive(request)
    const second = service.derive(request)

    // Waited for rather than released outright: `derive` reaches its hash a tick after the call,
    // and a release fired before that resolves a promise nobody is holding yet.
    await vi.waitFor(() => expect(injected.hash).toHaveBeenCalled())
    releaseHash()
    await Promise.all([first, second])

    expect(stages(injected.onProgress).filter(stage => stage === 'cancelled')).toEqual([
      'cancelled',
    ])
  })

  // The other half of that replacement, and the one nothing on screen would explain: the run
  // that was superseded ends LAST, and its own bookkeeping must not take the live one with it.
  it('leaves cancel pointing at the run still standing', async () => {
    const injected = deps()
    let releaseHash = (): void => {}
    let releasePeaks = (): void => {}
    injected.hash = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<string>(resolve => (releaseHash = () => resolve('abc123'))),
      )
      .mockImplementation(async () => 'abc123')
    injected.computePeaks = vi.fn(
      () =>
        new Promise<Float32Array>(resolve => (releasePeaks = () => resolve(new Float32Array(2)))),
    )

    const service = createMediaService(injected)
    const first = service.derive(request)
    const second = service.derive(request)

    await vi.waitFor(() => expect(injected.hash).toHaveBeenCalled())
    releaseHash()
    await first
    await vi.waitFor(() => expect(injected.computePeaks).toHaveBeenCalled())

    service.cancel('asset-1')
    releasePeaks()
    await second

    expect(stages(injected.onProgress).at(-1)).toBe('cancelled')
  })

  it('reports its stages, so a take being prepared is not a window doing nothing', async () => {
    const injected = deps()
    await createMediaService(injected).derive(request)

    expect(stages(injected.onProgress)).toEqual(['queued', 'hash', 'peaks', 'done'])
  })

  // The maintenance a project does on opening is not an import: those rows read as files the
  // user never picked, and a failed one leaves a notice to dismiss for a file they never chose.
  it('says nothing at all when it was not asked to announce', async () => {
    const injected = deps()
    await createMediaService(injected).derive({ ...request, announce: false })

    expect(stages(injected.onProgress)).toEqual([])
    expect(injected.save).toHaveBeenCalled()
  })

  /**
   * Nothing to derive AND nothing to remember. A row stamped with a hash reads as one the
   * pipeline has been through, so the catch-up that runs once ffmpeg IS resolved would skip it
   * for good — the take would show a grey tile and a flat waveform for the rest of its life.
   */
  it('writes nothing at all when there is no ffmpeg to derive with', async () => {
    const injected = deps({ ffmpeg: () => null })
    await createMediaService(injected).derive(request)

    expect(injected.save).not.toHaveBeenCalled()
  })

  it('skips the proxy for a file the browser can already decode', async () => {
    const injected = deps({
      probe: vi.fn(async (): Promise<ProbeOutcome> => ({
        kind: 'probed',
        probe: { ...probe, codec: 'avc1', height: 1080 },
      })),
    })
    await createMediaService(injected).ingest('asset-1', '/clip.mp4', 'video')

    expect(stages(injected.onProgress)).toEqual(['queued', 'probe', 'hash', 'peaks', 'done'])
  })

  it('stops at the probe and says so when ffmpeg is missing', async () => {
    const injected = deps({ ffmpeg: () => null })
    const service = createMediaService(injected)

    await service.ingest('asset-1', '/Volumes/Rushes/rush.mov', 'video')

    expect(stages(injected.onProgress)).toEqual(['queued', 'probe', 'hash', 'done'])
    expect(injected.save).toHaveBeenCalledWith('asset-1', {
      sourcePath: '/Volumes/Rushes/rush.mov',
      probe,
      hash: 'abc123',
    })
  })
})
