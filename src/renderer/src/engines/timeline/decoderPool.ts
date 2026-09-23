import { usToSeconds, type Us } from '@shared/domain/time'

/**
 * The only place microseconds meet mediabunny's float seconds.
 *
 * A consumer GPU offers two to four hardware decoders: four tracks playing without a bound is
 * the collapse this pool exists to prevent.
 */
export type VideoSampleLike = {
  toVideoFrame: () => VideoFrame
  close: () => void
}

export type SinkLike = {
  /**
   * The frame under this second. A sequential sink OWNS what it hands back — closing the sample
   * is a no-op there, and the frame is only good until the next ask on that sink. Take the
   * `VideoFrame` out before asking again; a still hands back one that outlives every ask.
   */
  getSample: (seconds: number) => Promise<VideoSampleLike | null>
  close: () => void
  /**
   * Whether this sink holds a hardware decoder. A still picture holds a bitmap and none, and
   * counting it against the decoder budget evicted a rush that did need one.
   */
  holdsDecoder: boolean
  /**
   * True when every timestamp yields the same picture. A live 3D clip also holds no decoder,
   * and skipping it would freeze the scene at the first frame.
   */
  stable: boolean
}

export type DecoderPoolDeps = {
  open: (assetId: string) => Promise<SinkLike>
  maxDecoders: number
  /** Pictures hold no decoder, so they answer to their own ceiling: memory, not silicon. */
  maxPictures: number
}

export type DecoderPool = {
  frameAt: (assetId: string, time: Us) => Promise<VideoFrame | null>
  /**
   * Whether opening this asset has already failed for good. `frameAt` answers `null` for a
   * position with no sample too, and only this tells the two apart — which is what a monitor
   * needs to say why it is black rather than stay silent about it.
   */
  undecodable: (assetId: string) => boolean
  /** Sinks held, both kinds together — decoders alone would not say what memory is spent. */
  openCount: () => number
  /** Whether this asset is a still that has finished opening — skip the next upload. */
  stable: (assetId: string) => boolean
  release: (assetId: string) => void
  dispose: () => void
}

export function createDecoderPool({
  open,
  maxDecoders,
  maxPictures,
}: DecoderPoolDeps): DecoderPool {
  /**
   * Insertion order is recency order: re-inserting on every use is what makes a Map an LRU.
   *
   * It holds the *opening*, not the opened sink. Two seeks a frame apart, or two tracks on one
   * rush, both miss while the first is still opening: awaiting first would have each of them
   * open a decoder, and the second overwrite the first here — a hardware decoder held by
   * nothing, for the session, on a slot count the OS caps at a handful.
   */
  const sinks = new Map<string, Promise<SinkLike>>()
  const undecodable = new Set<string>()
  /**
   * What has finished opening, and of those, which hold no decoder.
   *
   * Both are needed because a sink's kind is unknown until it settles. Counting an opening in
   * flight against the decoders is what made a picture, slow to fetch and decode, evict the two
   * rushes underneath it on every frame it took to arrive.
   */
  const settled = new Set<string>()
  const pictures = new Set<string>()
  const stables = new Set<string>()

  const touch = (assetId: string, opening: Promise<SinkLike>): void => {
    sinks.delete(assetId)
    sinks.set(assetId, opening)
  }

  const forget = (assetId: string): void => {
    sinks.delete(assetId)
    settled.delete(assetId)
    pictures.delete(assetId)
    stables.delete(assetId)
  }

  /** Closes whenever it finishes opening. A failed open is `sinkFor`'s business, not ours. */
  const closeLater = (opening: Promise<SinkLike>): void => {
    void opening.then(sink => sink.close()).catch(() => {})
  }

  /**
   * Two ceilings, because the two kinds are scarce for different reasons. Insertion order is
   * recency order, so dropping from the front drops the least recently used of the kind.
   *
   * Only settled sinks are counted and dropped: one still in flight has no known kind.
   */
  const evict = (keep?: string): void => {
    const counted = (assetId: string): boolean => settled.has(assetId) && assetId !== keep
    dropOldest(id => counted(id) && !pictures.has(id), decoders() - maxDecoders)
    dropOldest(id => counted(id) && pictures.has(id), pictures.size - maxPictures)
  }

  const decoders = (): number => settled.size - pictures.size

  const dropOldest = (counted: (assetId: string) => boolean, over: number): void => {
    let left = over
    for (const assetId of [...sinks.keys()]) {
      if (left <= 0) return
      if (!counted(assetId)) continue

      const opening = sinks.get(assetId)
      forget(assetId)
      if (opening) closeLater(opening)
      left -= 1
    }
  }

  const sinkFor = async (assetId: string): Promise<SinkLike | null> => {
    if (undecodable.has(assetId)) return null

    let opening = sinks.get(assetId)
    if (opening) touch(assetId, opening)
    else {
      // A burst of 3D clips otherwise opened one WebGL context each before any settled.
      const inFlight = [...sinks.keys()].filter(id => !settled.has(id)).length
      if (inFlight >= maxPictures) return null
      opening = open(assetId)
      sinks.set(assetId, opening)
      evict()
    }

    try {
      const sink = await opening
      // The kind is known only here, and `keep` spares this one: the caller is about to draw it,
      // and handing back a sink this very call had closed would blank the track for a frame.
      if (sinks.has(assetId)) {
        settled.add(assetId)
        if (!sink.holdsDecoder) pictures.add(assetId)
        if (sink.stable) stables.add(assetId)
        evict(assetId)
      }
      return sink
    } catch {
      // Remembered, not retried: reopening a broken asset sixty times a second is a stutter,
      // and the clip shows a placeholder either way.
      forget(assetId)
      undecodable.add(assetId)
      return null
    }
  }

  return {
    frameAt: async (assetId, time) => {
      const sink = await sinkFor(assetId)
      if (!sink) return null

      try {
        const sample = await sink.getSample(usToSeconds(time))
        if (!sample) return null

        const frame = sample.toVideoFrame()
        sample.close()
        return frame
      } catch {
        // Same promise as a failed open, for the same reason: a throw here reaches the caller
        // mid-paint, and the frames it already swapped in would never be drawn. Not remembered
        // as undecodable — one position failing does not condemn the rush.
        return null
      }
    },

    undecodable: assetId => undecodable.has(assetId),

    openCount: () => sinks.size,

    stable: assetId => stables.has(assetId),

    release: assetId => {
      const opening = sinks.get(assetId)
      forget(assetId)
      if (opening) closeLater(opening)
      undecodable.delete(assetId)
    },

    dispose: () => {
      for (const opening of sinks.values()) closeLater(opening)
      sinks.clear()
      settled.clear()
      pictures.clear()
      stables.clear()
      undecodable.clear()
    },
  }
}
