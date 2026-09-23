import { describe, expect, it, vi } from 'vitest'
import { createSequentialSink, type SequentialSource, type TimedSample } from './sequentialSink'

const FRAME = 0.04

/**
 * A source shaped like mediabunny's own sequential read, which is the whole point of this fake:
 * a run yields the frame COVERING its start first — the LAST frame when that start is past the
 * end — then every frame after it, and yields only when it is pulled. The old fake answered a
 * frame per timestamp pushed, which mediabunny never does, and that is why no gate saw a montage
 * unable to decode a single frame.
 */
const sourceOf = ({
  frames = Number.POSITIVE_INFINITY,
  startsAt = 0,
}: { frames?: number; startsAt?: number } = {}): SequentialSource & {
  opened: number[]
  closed: number[]
} => {
  const opened: number[] = []
  const closed: number[] = []

  return {
    opened,
    closed,
    samples: from => {
      opened.push(from)
      return {
        async *[Symbol.asyncIterator]() {
          const asked = Math.floor((from - startsAt) / FRAME + 1e-9)
          let index = Math.min(Math.max(0, asked), frames - 1)
          while (index < frames) {
            const at = startsAt + index * FRAME
            index += 1
            yield {
              timestamp: at,
              // The suite never draws: a frame only has to say which one it is.
              toVideoFrame: () => at as unknown as VideoFrame,
              close: () => closed.push(at),
            } satisfies TimedSample
          }
        },
      }
    },
    close: vi.fn(),
  }
}

const frameAt = async (sink: ReturnType<typeof createSequentialSink>, seconds: number) =>
  (await sink.getSample(seconds))?.toVideoFrame() as unknown as number | undefined

describe('sequential video sink', () => {
  it('settles on a run that never ends, which is every rush being played', async () => {
    const sink = createSequentialSink(sourceOf())

    expect(await frameAt(sink, 0.05)).toBeCloseTo(0.04)
  })

  it('walks one open run across a play-through', async () => {
    const source = sourceOf()
    const sink = createSequentialSink(source)

    expect(await frameAt(sink, 0)).toBeCloseTo(0)
    expect(await frameAt(sink, 0.04)).toBeCloseTo(0.04)
    expect(await frameAt(sink, 0.5)).toBeCloseTo(0.48)

    expect(source.opened).toEqual([0])
  })

  it('opens a new run when the head goes backward', async () => {
    const source = sourceOf()
    const sink = createSequentialSink(source)

    await sink.getSample(1)
    expect(await frameAt(sink, 0.2)).toBeCloseTo(0.2)

    expect(source.opened).toEqual([1, 0.2])
  })

  it('opens a new run rather than walking a jump of more than two seconds', async () => {
    const source = sourceOf()
    const sink = createSequentialSink(source)

    await sink.getSample(1)
    await sink.getSample(2.9)
    await sink.getSample(6)

    expect(source.opened).toEqual([1, 6])
  })

  /**
   * A rush carrying an edit list starts after zero, so a run opened at zero answers a frame that
   * begins later than it was asked for. Measured against the frame rather than against the ask,
   * that reads as a rewind, and the head of such a clip tore its run down on every seek.
   */
  it('keeps the run when its first frame starts later than the second asked for', async () => {
    const source = sourceOf({ startsAt: 0.033 })
    const sink = createSequentialSink(source)

    expect(await frameAt(sink, 0)).toBeCloseTo(0.033)
    expect(await frameAt(sink, 0.01)).toBeCloseTo(0.033)

    expect(source.opened).toEqual([0])
  })

  it('answers overlapping asks in order, never two pulls at once', async () => {
    const source = sourceOf()
    const sink = createSequentialSink(source)

    const [first, second] = await Promise.all([sink.getSample(0), sink.getSample(0.08)])

    expect(first?.toVideoFrame() as unknown as number).toBeCloseTo(0)
    expect(second?.toVideoFrame() as unknown as number).toBeCloseTo(0.08)
    expect(source.opened).toEqual([0])
  })

  it('keeps the frame it handed back when the caller closes its sample', async () => {
    const source = sourceOf()
    const sink = createSequentialSink(source)

    const sample = await sink.getSample(0.1)
    sample?.close()

    expect(sample?.toVideoFrame() as unknown as number).toBeCloseTo(0.08)
    expect(source.closed).not.toContain(0.08)
  })

  it('holds the last frame past the end of the media, as the read itself does', async () => {
    const sink = createSequentialSink(sourceOf({ frames: 3 }))

    expect(await frameAt(sink, 9)).toBeCloseTo(0.08)
  })

  /**
   * mediabunny raises a decoder's out-of-band errors from the pull itself. Taking the next frame
   * out of `ahead` only after that pull left both names on one sample, which the following walk
   * closed and handed back closed — a track black for a whole horizon, with nothing to report.
   */
  it('does not hand back a closed frame when the decoder throws mid-walk', async () => {
    const closed: number[] = []
    const source: SequentialSource = {
      samples: () => ({
        async *[Symbol.asyncIterator]() {
          for (const at of [0, FRAME]) {
            yield {
              timestamp: at,
              toVideoFrame: () => at as unknown as VideoFrame,
              close: () => closed.push(at),
            }
          }
          throw new Error('the decoder gave up')
        },
      }),
      close: vi.fn(),
    }
    const sink = createSequentialSink(source)

    await sink.getSample(0)
    await expect(sink.getSample(0.05)).rejects.toThrow('the decoder gave up')

    expect(await frameAt(sink, 0.06)).toBeCloseTo(FRAME)
    expect(closed).not.toContain(FRAME)
  })

  it('closes the source once, and refuses samples afterwards', async () => {
    const source = sourceOf()
    const sink = createSequentialSink(source)

    await sink.getSample(0)
    sink.close()
    sink.close()

    expect(source.close).toHaveBeenCalledTimes(1)
    expect(await sink.getSample(1)).toBeNull()
  })

  it('holds a decoder and is not a still', () => {
    const sink = createSequentialSink(sourceOf())

    expect(sink.holdsDecoder).toBe(true)
    expect(sink.stable).toBe(false)
  })
})
