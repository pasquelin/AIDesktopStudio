import { describe, expect, it, vi } from 'vitest'
import type { MediaProbe } from '@shared/domain/asset'
import type { ProbeOutcome } from './probe'
import { createMediaService, needsProxy, type MediaServiceDeps } from './service'

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

describe('proxy decision', () => {
  it('asks for a proxy when the codec is not decodable by WebCodecs', () => {
    expect(needsProxy({ ...probe, height: 720 })).toBe(true)
  })

  it('asks for a proxy above 1080p even for a decodable codec', () => {
    expect(needsProxy({ ...probe, codec: 'avc1', height: 2160 })).toBe(true)
  })

  it('skips the proxy for a small H.264 file, which is the generated-clip case', () => {
    expect(needsProxy({ ...probe, codec: 'avc1', height: 1080 })).toBe(false)
  })

  it('skips the proxy for the codec names ffprobe uses, not only the WebCodecs ones', () => {
    expect(needsProxy({ ...probe, codec: 'h264', height: 1080 })).toBe(false)
    expect(needsProxy({ ...probe, codec: 'av1', height: 1080 })).toBe(false)
  })

  it('never asks for a video proxy for an audio-only file', () => {
    expect(needsProxy({ duration: 1, codec: 'mp3', sampleRate: 44_100 })).toBe(false)
  })
})

describe('media service', () => {
  it('reports every stage in order', async () => {
    const injected = deps()
    await createMediaService(injected).ingest('asset-1', '/Volumes/Rushes/rush.mov', 'video')

    expect(stages(injected.onProgress)).toEqual([
      'queued',
      'probe',
      'hash',
      'proxy',
      'peaks',
      'done',
    ])
  })

  it('records the probe, the hash and the derived files on the asset', async () => {
    const injected = deps()
    await createMediaService(injected).ingest('asset-1', '/Volumes/Rushes/rush.mov', 'video')

    expect(injected.save).toHaveBeenCalledWith('asset-1', {
      sourcePath: '/Volumes/Rushes/rush.mov',
      probe,
      hash: 'abc123',
      posterPath: '.index/posters/asset-1.jpg',
      proxyPath: '.index/proxies/abc123.mp4',
      peaksPath: '.index/peaks/abc123.bin',
    })
  })

  /**
   * A rush picked off the disk has no library still to bring down, and both the shelf and the
   * clip on the strip read `posterUrl`: without this, every imported take is the same grey
   * rectangle wearing a film glyph.
   */
  it('grabs a still of a rush, taken past the black a take often opens on', async () => {
    const injected = deps()
    await createMediaService(injected).ingest('asset-1', '/Volumes/Rushes/rush.mov', 'video')

    const args = vi.mocked(injected.run).mock.calls.map(([, given]) => given)
    // A tenth of the way into twenty seconds, and one frame out.
    expect(args[0]).toContain('2.000')
    expect(args[0]).toEqual(expect.arrayContaining(['/tmp/project/.index/posters/asset-1.jpg']))
  })

  // The still is a convenience; the rush is the asset. Same rule as the one a download brings
  // beside a mesh — a refusal here must not cost the import.
  it('imports the rush all the same when the still cannot be grabbed', async () => {
    const injected = deps({
      run: vi.fn(async (_binary: string, args: string[]) => {
        if (args.includes('-frames:v')) throw new Error('no keyframe there')
        return Buffer.alloc(0)
      }),
    })

    await createMediaService(injected).ingest('asset-1', '/Volumes/Rushes/rush.mov', 'video')

    expect(stages(injected.onProgress)).toContain('done')
    expect(vi.mocked(injected.save).mock.calls[0]?.[1]).not.toHaveProperty('posterPath')
  })

  // A sound has a waveform, and a still recorded here would be painted under it.
  it('grabs none for a sound', async () => {
    const injected = deps()
    await createMediaService(injected).ingest('asset-1', '/take.wav', 'audio')

    expect(vi.mocked(injected.save).mock.calls[0]?.[1]).not.toHaveProperty('posterPath')
  })
})

/**
 * A generation never meets the picker, so nothing derived what a montage reads: its sound clip
 * drew a flat rectangle where a waveform belongs — `stores/peaks` reads the file written here
 * and never recomputes — and a codec the window cannot decode had no proxy to fall back on.
 */
describe('what an import leaves behind to read', () => {
  it('records the file that landed, by name and never by path', async () => {
    const record = vi.fn()
    const service = createMediaService(deps({ record, probe: probing({ codec: 'avc1' }) }))

    await service.ingest('asset_1', '/Users/someone/Movies/rush.mp4', 'video')

    expect(record).toHaveBeenCalledWith({
      level: 'info',
      topic: 'import',
      messageKey: 'activity.imported',
      params: { name: 'rush.mp4' },
    })
  })

  it('records a file the probe refused as a failure of its own', async () => {
    const record = vi.fn()
    const service = createMediaService(
      deps({ record, probe: vi.fn(async (): Promise<ProbeOutcome> => ({ kind: 'unreadable' })) }),
    )

    await service.ingest('asset_1', '/tmp/notes.txt', 'video')

    expect(record).toHaveBeenCalledWith({
      level: 'error',
      topic: 'import',
      messageKey: 'activity.importUnreadable',
      params: { name: 'notes.txt' },
    })
  })

  // The user did it: telling them about it is telling them what they already know.
  it('says nothing about an import that was cancelled', async () => {
    const record = vi.fn()
    const service = createMediaService(
      deps({ record, hash: vi.fn(async () => 'abc123'), probe: probing({ codec: 'avc1' }) }),
    )

    const running = service.ingest('asset_1', '/tmp/rush.mp4', 'video')
    service.cancel('asset_1')
    await running

    expect(record).not.toHaveBeenCalled()
  })

  // Not a problem: the bytes are already in the project, which is what the user wanted.
  it('says nothing about bytes the project already holds', async () => {
    const record = vi.fn()
    const service = createMediaService(
      deps({ record, duplicateExists: vi.fn(async () => true), probe: probing({ codec: 'avc1' }) }),
    )

    await service.ingest('asset_1', '/tmp/rush.mp4', 'video')

    expect(record).not.toHaveBeenCalled()
  })
})
