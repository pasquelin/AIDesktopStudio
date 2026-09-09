import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  chooseSink,
  createStillSink,
  openAssetSink,
  type SinkPort,
  type StillPicture,
} from './sinkPort'
import type { SinkLike } from './decoderPool'

/** The demuxer, as far as this suite is concerned: what it answers, and what it was told. */
const demuxer = vi.hoisted(() => ({
  dispose: vi.fn(),
  samples: vi.fn((_from: number): AsyncIterable<never> => ({
    async *[Symbol.asyncIterator]() {},
  })),
  track: null as unknown,
  refuses: false,
  sources: new Array<Blob>(),
}))

vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {
    constructor(blob: Blob) {
      demuxer.sources.push(blob)
    }
  },
  Input: class {
    dispose = demuxer.dispose
    getPrimaryVideoTrack = async (): Promise<unknown> => {
      if (demuxer.refuses) throw new Error('not a container')
      return demuxer.track
    }
  },
  VideoSampleSink: class {
    samples = demuxer.samples
  },
}))

const picture = (): StillPicture & { frame: ReturnType<typeof vi.fn> } => {
  let drawn = 0
  return {
    // The suite never draws, so the frames only have to be distinguishable from one another.
    frame: vi.fn(() => `frame ${(drawn += 1)}` as unknown as VideoFrame),
    close: vi.fn(),
  }
}

const videoSink = (): SinkLike => ({
  getSample: vi.fn(async () => null),
  close: vi.fn(),
  holdsDecoder: true,
  stable: false,
})

const port = (over: Partial<SinkPort> = {}): SinkPort => ({
  read: vi.fn(async () => new Blob()),
  openVideo: vi.fn(async () => null),
  openPicture: vi.fn(async () => picture()),
  ...over,
})

const frameOf = async (sink: SinkLike, seconds: number): Promise<VideoFrame | undefined> =>
  (await sink.getSample(seconds))?.toVideoFrame()

describe('still sink', () => {
  it('answers the same picture at every position', async () => {
    const still = picture()
    const sink = createStillSink(still)

    expect(await frameOf(sink, 0)).toBe('frame 1')
    expect(await frameOf(sink, 42)).toBe('frame 2')
    expect(still.frame).toHaveBeenCalledTimes(2)
  })

  it('keeps the picture open when a sample closes, and lets it go when the sink does', async () => {
    const still = picture()
    const sink = createStillSink(still)

    const sample = await sink.getSample(0)
    sample?.close()
    expect(still.close).not.toHaveBeenCalled()

    sink.close()
    expect(still.close).toHaveBeenCalledTimes(1)
  })
})

describe('opening a sink', () => {
  it('takes the video track when the asset carries one', async () => {
    const video = videoSink()
    const sources = port({ openVideo: vi.fn(async () => video) })

    expect(await chooseSink('a', sources)).toBe(video)
    expect(sources.openPicture).not.toHaveBeenCalled()
  })

  it('falls back to the picture when the asset carries no video track', async () => {
    const still = picture()
    const sources = port({ openPicture: vi.fn(async () => still) })

    expect(await frameOf(await chooseSink('a', sources), 0)).toBe('frame 1')
  })

  it('falls back to the picture when reading the container is refused', async () => {
    const still = picture()
    const sources = port({
      openVideo: vi.fn(() => Promise.reject(new Error('not a container'))),
      openPicture: vi.fn(async () => still),
    })

    expect(await frameOf(await chooseSink('a', sources), 0)).toBe('frame 1')
  })

  it('falls back to the picture when the container refuses without ever awaiting', async () => {
    const still = picture()
    const sources = port({
      // A `.catch` on the call would sail past this one, and a picture would stay black.
      openVideo: vi.fn(() => {
        throw new Error('not a container')
      }),
      openPicture: vi.fn(async () => still),
    })

    expect(await frameOf(await chooseSink('a', sources), 0)).toBe('frame 1')
  })

  it('reads the bytes once, and hands the same ones to both attempts', async () => {
    const bytes = new Blob()
    const sources = port({ read: vi.fn(async () => bytes) })

    await chooseSink('a', sources)

    expect(sources.read).toHaveBeenCalledTimes(1)
    expect(sources.openVideo).toHaveBeenCalledWith(bytes)
    expect(sources.openPicture).toHaveBeenCalledWith(bytes)
  })

  it('fails for bytes that are neither a video nor a picture', async () => {
    const sources = port({
      openPicture: vi.fn(() => Promise.reject(new Error('not an image'))),
    })

    await expect(chooseSink('a', sources)).rejects.toThrow('not an image')
  })
})

/**
 * The port itself, over a demuxer and an image decoder jsdom does not have. Doubles here would
 * prove nothing about the wiring, and the wiring is what makes a picture reach the monitor.
 */
describe('the browser behind the port', () => {
  const bitmap = { close: vi.fn() }
  const decode = vi.fn(async () => bitmap)

  beforeEach(() => {
    demuxer.track = null
    demuxer.refuses = false
    demuxer.sources = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('bytes')),
    )
    vi.stubGlobal('createImageBitmap', decode)
    vi.stubGlobal('VideoFrame', class {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('decodes the picture of an asset that carries no video track, and lets the demuxer go', async () => {
    const sink = await openAssetSink('a')

    expect(decode).toHaveBeenCalledOnce()
    expect(demuxer.dispose).toHaveBeenCalledOnce()
    expect((await sink.getSample(0))?.toVideoFrame()).toBeInstanceOf(VideoFrame)
  })

  it('hands the same bytes to the demuxer and to the image decoder', async () => {
    await openAssetSink('a')

    const [read] = demuxer.sources
    expect(await read?.text()).toBe('bytes')
    expect(decode).toHaveBeenCalledWith(read)
  })

  it('takes the video track when there is one, and never decodes a picture then', async () => {
    demuxer.track = { id: 1 }

    const sink = await openAssetSink('a')
    await sink.getSample(2)

    expect(demuxer.samples).toHaveBeenCalledWith(2)
    expect(decode).not.toHaveBeenCalled()
    expect(demuxer.dispose).not.toHaveBeenCalled()

    sink.close()
    expect(demuxer.dispose).toHaveBeenCalledOnce()
  })

  it('falls back to the picture when the bytes are no container at all', async () => {
    demuxer.refuses = true

    const sink = await openAssetSink('a')

    // Released even on the path that throws: the input holds the demuxer either way.
    expect(demuxer.dispose).toHaveBeenCalledOnce()
    expect((await sink.getSample(0))?.toVideoFrame()).toBeInstanceOf(VideoFrame)
  })

  it('draws a new frame per seek, and closes the picture only when the sink closes', async () => {
    const sink = await openAssetSink('a')

    const first = (await sink.getSample(0))?.toVideoFrame()
    const later = (await sink.getSample(9))?.toVideoFrame()
    expect(first).not.toBe(later)
    expect(decode).toHaveBeenCalledOnce()
    expect(bitmap.close).not.toHaveBeenCalled()

    sink.close()
    expect(bitmap.close).toHaveBeenCalledOnce()
  })
})
