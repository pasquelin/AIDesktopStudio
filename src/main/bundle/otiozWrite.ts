import { orElse } from '@shared/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import { rm, stat } from 'node:fs/promises'
import { finished, pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { Zip, ZipPassThrough, strToU8 } from 'fflate'
import { steppedProgress, type TaskWatch } from '@shared/domain/taskProgress'
import {
  OTIOZ_CONTENT_PATH,
  OTIOZ_VERSION,
  OTIOZ_VERSION_PATH,
  type BundledMedium,
} from '@shared/domain/otioz'

/**
 * Writing an OpenTimelineIO bundle, media and all.
 *
 * STREAMED rather than built in memory, which is the whole difference between this and the `.ora`
 * writer next door: a stack of layers is tens of megabytes and a montage is the rushes themselves.
 * `zipSync` would hold every rush in memory at once AND deflate them on the thread that owns every
 * window — invariant 6, at a scale where it is seconds rather than milliseconds.
 */

export type OtiozContents = {
  /** `content.otio`, already serialized by the side that holds the catalogue. */
  content: string
  /** Absolute paths, paired with the entry each takes — `bundleOf` decided the names. */
  media: readonly (BundledMedium & { path: string })[]
}

/**
 * A medium the cut names and the disk does not have.
 *
 * Refused rather than skipped, and this is a decision: a bundle quietly missing a rush opens in
 * the target with a red clip nobody can explain, hours later. The name is in the message so the
 * person knows which one to find.
 */
export class MissingMediumError extends Error {
  constructor(readonly entry: string) {
    super(`this montage points at a file that is not there: ${entry}`)
  }
}

/**
 * Asked to stop, by the person who started it. Private, and never seen by a caller: it exists to
 * unwind a stream pipeline that has no other way back, and `writeOtiozFile` answers `false`.
 */
class ExportCancelledError extends Error {}

/**
 * Pushed in chunks rather than whole, so one rush never sits in memory beside the others — and
 * only while the disk keeps up. Without the wait, reading is bounded by nothing: a fast source
 * and a slow destination hold the difference in memory, which on a montage is the whole rush.
 */
async function pushFile(
  into: ZipPassThrough,
  path: string,
  room: () => Promise<void>,
  wrote: (bytes: number) => void,
) {
  for await (const chunk of createReadStream(path, { highWaterMark: 1 << 20 })) {
    // `Buffer` IS a `Uint8Array`, and fflate reads it as one — no copy is made here.
    into.push(chunk, false)
    wrote(chunk.length)
    await room()
  }
  into.push(new Uint8Array(0), true)
}

function storedEntry(zip: Zip, name: string, bytes: Uint8Array): void {
  const entry = new ZipPassThrough(name)
  zip.add(entry)
  entry.push(bytes, true)
}

async function bundleSize(
  contentBytes: number,
  media: OtiozContents['media'],
  signal?: AbortSignal,
): Promise<number | null> {
  let total = contentBytes
  for (const medium of media) {
    const found = await orElse(stat(medium.path), null)
    if (!found?.isFile()) throw new MissingMediumError(medium.entry)
    if (signal?.aborted) return null
    total += found.size
  }
  return total
}

async function removePartial(
  path: string,
  out: ReturnType<typeof createWriteStream>,
): Promise<void> {
  try {
    await finished(out)
  } catch {
    // The original stream failure is the useful error.
  }
  try {
    await rm(path, { force: true })
  } catch {
    // Cancellation must still be reported as cancellation when cleanup fails.
  }
}

type BundleOutput = {
  path: string
  out: ReturnType<typeof createWriteStream>
  chunks: Readable
  zip: Zip
  encodedContent: Uint8Array
  media: OtiozContents['media']
  room: () => Promise<void>
  wrote: (bytes: number) => void
  drained: Promise<void>
  signal?: AbortSignal
  abandon: () => void
}

async function finishBundle(output: BundleOutput): Promise<boolean> {
  const { path, out, chunks, zip, encodedContent, media, room, wrote, drained, signal, abandon } =
    output
  try {
    storedEntry(zip, OTIOZ_VERSION_PATH, strToU8(OTIOZ_VERSION))
    storedEntry(zip, OTIOZ_CONTENT_PATH, encodedContent)
    wrote(encodedContent.length)
    for (const medium of media) {
      await room()
      const entry = new ZipPassThrough(medium.entry)
      zip.add(entry)
      await pushFile(entry, medium.path, room, wrote)
    }
    zip.end()
    await drained
    return true
  } catch (error) {
    chunks.destroy()
    out.destroy()
    await removePartial(path, out)
    if (error instanceof ExportCancelledError) return false
    throw error
  } finally {
    signal?.removeEventListener('abort', abandon)
  }
}

/**
 * The bundle, written where it was asked for. Answers whether it was — `false` when it was
 * stopped, which is a decision rather than a failure and leaves nothing on disk.
 *
 * Everything is `ZipPassThrough` — stored, never deflated. That is what lets a reader play a rush
 * in place without unpacking the bundle first, and it is what the reference implementation writes.
 * Deflating an already-compressed video buys nothing and costs the whole file.
 */
export async function writeOtiozFile(
  path: string,
  { content, media }: OtiozContents,
  { onStep, signal }: TaskWatch = {},
): Promise<boolean> {
  if (signal?.aborted) return false

  // Encoded once, and counted in BYTES: `content.length` is code units, and a cut full of accented
  // clip names encodes to up to three times that — a total the progress would never reach.
  const encodedContent = strToU8(content)

  // Nothing is opened before every medium is there: half a bundle looks exactly like a whole one.
  // The sizes come free with the check, and they are what makes the progress a real fraction
  // rather than a count of files — one rush of thirty gigabytes among six small ones.
  const total = await bundleSize(encodedContent.length, media, signal)
  if (total === null) return false

  return streamBundle(path, { content, media }, { onStep, signal }, encodedContent, total)
}

async function streamBundle(
  path: string,
  { media }: OtiozContents,
  { onStep, signal }: TaskWatch,
  encodedContent: Uint8Array,
  total: number,
): Promise<boolean> {
  const wrote = steppedProgress(total, onStep)
  return finishBundle({ ...openBundleOutput(path, signal), encodedContent, media, wrote })
}

function openBundleOutput(
  path: string,
  signal?: AbortSignal,
): Omit<BundleOutput, 'encodedContent' | 'media' | 'wrote'> {
  const out = createWriteStream(path)
  let wanted = false
  let wake: (() => void) | null = null
  let failure: Error | null = null

  /** Whatever went wrong, remembered once and told to whoever is waiting for room. */
  const stop = (error: Error): void => {
    failure ??= error
    wake?.()
    wake = null
  }

  const chunks = new Readable({
    read: () => {
      wanted = true
      wake?.()
      wake = null
    },
  })

  const zip = new Zip((error, data, final) => {
    if (error) {
      stop(error)
      chunks.destroy(error)
      return
    }
    wanted = chunks.push(data)
    if (final) chunks.push(null)
  })

  const drained = pipeline(chunks, out)
  // Attached at once rather than at the await below: a disk that fills up rejects this seconds
  // before the media loop ends, and an unhandled rejection takes the whole main process down.
  drained.catch(stop)

  // Through the same door a disk failure uses, so one exit unwinds both: whoever is waiting for
  // room is woken, the loop throws, and the `catch` below takes the half-written bundle away.
  const abandon = (): void => stop(new ExportCancelledError())
  signal?.addEventListener('abort', abandon, { once: true })

  /**
   * Resolves once the destination has room, so reading never runs ahead of writing — and THROWS
   * when there is no destination left. Spinning until `read` is called again never ends once the
   * sink is destroyed: the export would never settle and the process that owns every window would
   * turn at full speed for as long as the studio stays open.
   */
  const room = async (): Promise<void> => {
    if (failure) throw failure
    if (wanted) return

    await new Promise<void>(resume => {
      wake = resume
    })
    if (failure) throw failure
  }

  return { path, out, chunks, zip, room, drained, signal, abandon }
}
