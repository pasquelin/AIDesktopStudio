import type { SinkLike, VideoSampleLike } from './decoderPool'

/** A decoded frame and where it starts in the source, in seconds. */
export type TimedSample = VideoSampleLike & { timestamp: number }

/**
 * A rush read forward: `samples` yields as it decodes, and its first frame is the one COVERING
 * the second asked for. Never mediabunny's `samplesAtTimestamps`, which decodes nothing until
 * its own input closes — a sink fed one timestamp per seek keeps it open, and settles never.
 */
export type SequentialSource = {
  samples: (from: number) => AsyncIterable<TimedSample>
  close: () => void
}

/**
 * Beyond this, opening a fresh run costs less than walking there frame by frame. The real unit is
 * FRAMES and the real boundary is the key packet's, which only the encode knows — seconds are a
 * stand-in, and a jump landing just under it costs one frame's budget on high-rate footage.
 *
 * Measured 2026-09-10 on this Mac: a run reopened at 4 s costs 45 ms on a 121-frame single-GOP
 * rush and 5.7 ms on a GOP of twelve, against 0.27 ms per frame walked — a break-even anywhere
 * between 19 and 167 frames. Two seconds is 48 frames at 24 i/s, inside that spread, and caps the
 * side that has no bound: a click far down the montage never walks a whole file.
 */
const RESTART_AHEAD = 2

/**
 * One position in one rush, walked forward.
 *
 * Two blind spots, neither of them new but both louder here. `decoderPool` keys a sink by ASSET,
 * so two clips of one rush shown at once share this one position and reopen the run past each
 * other every frame. And an open run pre-decodes a handful of frames ahead — a cost `Monitor`'s
 * picture budget does not count, and the reason playback is served the proxy rather than a 4K
 * original.
 */
export function createSequentialSink(source: SequentialSource): SinkLike {
  let run: AsyncIterator<TimedSample> | null = null
  /** The frame under the second last answered, and the one after it — see `walkTo`. */
  let held: TimedSample | null = null
  let ahead: TimedSample | null = null
  /**
   * The second this run last answered. Forward is measured from HERE rather than from `held`'s
   * own timestamp: a run opened past the end answers the last frame, and one opened on media
   * carrying an edit list answers a frame starting later than asked — both read as a rewind.
   */
  let answered = Number.NEGATIVE_INFINITY
  let closed = false
  let chain: Promise<void> = Promise.resolve()

  const pull = async (): Promise<TimedSample | null> => {
    const step = await run?.next()
    return step && step.done !== true ? step.value : null
  }

  const stop = async (): Promise<void> => {
    const previous = run
    run = null
    held?.close()
    ahead?.close()
    held = null
    ahead = null
    answered = Number.NEGATIVE_INFINITY
    await previous?.return?.()
  }

  const restart = async (seconds: number): Promise<void> => {
    await stop()
    if (closed) return
    run = source.samples(seconds)[Symbol.asyncIterator]()
    held = await pull()
    ahead = held ? await pull() : null
  }

  /**
   * Forward inside the run already open. The frame under a second is the last one to start
   * before it, so it is the one AFTER that says when to stop — never its own duration, which a
   * container is free to leave at zero.
   */
  const walkTo = async (seconds: number): Promise<void> => {
    while (ahead && ahead.timestamp <= seconds) {
      // Taken out of `ahead` before the pull: a decoder throwing there would otherwise leave both
      // names on one sample, and the next walk would close it and hand it back closed.
      const next = ahead
      ahead = null
      held?.close()
      held = next
      ahead = await pull()
    }
  }

  const sampleAt = async (seconds: number): Promise<VideoSampleLike | null> => {
    if (closed) return null

    const walkable = held !== null && seconds >= answered && seconds < answered + RESTART_AHEAD
    if (walkable) await walkTo(seconds)
    else await restart(seconds)
    answered = seconds

    const frame = held
    if (closed || !frame) return null
    // Kept by the sink and not by the caller: the next seek wants this very frame or the one
    // after it, and one closed on the way out would have to be decoded again.
    return { toVideoFrame: () => frame.toVideoFrame(), close: () => {} }
  }

  return {
    holdsDecoder: true,
    stable: false,
    getSample: seconds => {
      const next = chain.then(
        () => sampleAt(seconds),
        () => sampleAt(seconds),
      )
      chain = next.then(
        () => undefined,
        () => undefined,
      )
      return next
    },
    close: () => {
      if (closed) return
      closed = true
      chain = chain.then(stop, stop)
      source.close()
    },
  }
}
