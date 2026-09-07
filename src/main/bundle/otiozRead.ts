import { createReadStream, createWriteStream, type WriteStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { finished } from 'node:stream/promises'
import { Unzip, UnzipInflate, UnzipPassThrough, strFromU8 } from 'fflate'
import { steppedProgress, type TaskWatch } from '@shared/domain/taskProgress'
import {
  bundleEntryOf,
  freeName,
  MAX_CONTENT_BYTES,
  OTIOZ_CONTENT_PATH,
  OTIOZ_MAJOR,
  OTIOZ_VERSION_PATH,
  otiozMajorOf,
  safeName,
  unpackedCeiling,
} from '@shared/domain/otioz'

// STREAMED for the reason the writer is: `unzipSync` would hold every rush in memory at once, and
// a montage bundle IS the rushes. The media land on disk as they arrive; only the cut is kept.

export type OtiozRead = {
  /** `content.otio`, as text. The caller parses it — this side never reads a timeline. */
  content: string
  /** Each medium that landed, by the entry the cut names and the file it became under `into`. */
  media: readonly { entry: string; file: string }[]
}

/** A file that is not a bundle, or one this reader refuses. Named so the caller can say why. */
export class NotABundleError extends Error {}

/**
 * An entry that would land outside the folder. Refused WHOLE rather than skipped: unpacking the
 * rest would leave somebody a montage that opened fine.
 */
export class BundleEscapeError extends Error {
  constructor(readonly entry: string) {
    super(`this bundle names an entry that would land outside it: ${entry}`)
  }
}

/** Asked to stop. Private, as the writer's is: `readOtiozFile` answers `null`. */
class ImportCancelledError extends Error {}

type Collected = { chunks: Uint8Array[]; bytes: number }

const readState = () => ({
  version: { chunks: [], bytes: 0 } as Collected,
  content: { chunks: [], bytes: 0 } as Collected,
  media: [] as { entry: string; file: string }[],
  sinks: [] as WriteStream[],
  taken: new Set<string>(),
})

const collect = (into: Collected, chunk: Uint8Array): void => {
  into.bytes += chunk.length
  if (into.bytes > MAX_CONTENT_BYTES) throw new NotABundleError('this cut is too large to be one')
  into.chunks.push(chunk)
}

const joined = ({ chunks, bytes }: Collected): Uint8Array => Buffer.concat(chunks, bytes)

async function feedArchive(
  archive: string,
  total: number,
  unzip: Unzip,
  room: () => Promise<void>,
  onStep?: TaskWatch['onStep'],
): Promise<void> {
  const read = steppedProgress(total, onStep)
  for await (const chunk of createReadStream(archive, { highWaterMark: 1 << 20 })) {
    unzip.push(chunk, false)
    read(chunk.length)
    await room()
  }
  unzip.push(new Uint8Array(0), true)
}

async function finishSinks(sinks: readonly WriteStream[]): Promise<void> {
  for (const sink of sinks) {
    sink.end()
    await finished(sink)
  }
}

/**
 * Unpacks the bundle into `into`, which the caller made and owns — including taking it away when
 * this answers `null` or throws. Answers `null` when it was stopped.
 */
export async function readOtiozFile(
  archive: string,
  into: string,
  { onStep, signal }: TaskWatch = {},
): Promise<OtiozRead | null> {
  if (signal?.aborted) return null

  const total = (await stat(archive)).size
  if (signal?.aborted) return null

  return unpackOtiozFile(archive, into, total, { onStep, signal })
}

async function unpackOtiozFile(
  archive: string,
  into: string,
  total: number,
  { onStep, signal }: TaskWatch,
): Promise<OtiozRead | null> {
  const { version, content, media, sinks, taken } = readState()

  let failure: Error | null = null
  let blocked: Promise<void> | null = null
  // Counted as it lands rather than read off a header: a zip declares its own sizes, and a bomb
  // declares them small. `UnzipInflate` is registered, so the ratio is the archive's to choose.
  let unpacked = 0
  const ceiling = unpackedCeiling(total)

  const unzip = new Unzip()
  // Both, explicitly: a bundle is written stored, but nothing stops another application from
  // deflating its own — and an unregistered method makes `start()` throw rather than skip.
  unzip.register(UnzipPassThrough)
  unzip.register(UnzipInflate)

  /** The version, refused as soon as it is legible. Throws, so the caller's `catch` names it. */
  const refuseUnknownVersion = (): void => {
    const spelled = otiozMajorOf(strFromU8(joined(version)))
    if (spelled !== OTIOZ_MAJOR) {
      throw new NotABundleError(`this bundle is version ${spelled}, and this reader knows 1`)
    }
  }

  /** Whether there is still room to write this chunk. Answers `false` once, and refuses after. */
  const grew = (bytes: number): boolean => {
    unpacked += bytes
    if (unpacked <= ceiling) return true
    failure ??= new NotABundleError('this bundle unpacks to far more than it weighs')
    return false
  }

  const drain = (
    sink: WriteStream,
    halted: Promise<void>,
    chunk: Uint8Array,
    last: boolean,
  ): void => {
    // Held so the archive stops being read while the disk catches up: without it, a fast source
    // and a slow destination keep the difference in memory, which here is a rush.
    const full = !sink.write(chunk)
    if (last) sink.end()
    if (!full) return

    // An ended stream never emits `drain`, so the flush is what a full buffer waits on there.
    // Otherwise the wait RACES the sink dying: a full disk emits `error` and never `drain` again,
    // and a reader holding out for one alone hung for good with the fault already named beside it.
    const room = last
      ? finished(sink).catch(() => {})
      : Promise.race([new Promise<void>(resume => sink.once('drain', () => resume())), halted])

    // Chained rather than replaced: two entries of one 1 MiB push can each fill their own sink,
    // and the first one's back-pressure used to be dropped on the floor.
    blocked = blocked ? blocked.then(() => room) : room
  }

  unzip.onfile = file => {
    // Once the bundle is refused, nothing more of it is opened: fflate hands over every entry of
    // a chunk before the loop gets to look at `failure`, and a file created here would outlive
    // the refusal in somebody's project.
    if (failure) return

    if (file.name === OTIOZ_VERSION_PATH || file.name === OTIOZ_CONTENT_PATH) {
      const collected = file.name === OTIOZ_VERSION_PATH ? version : content
      file.ondata = (error, chunk, final) => {
        if (error) failure ??= error
        else
          try {
            collect(collected, chunk)
            // Read the MOMENT the version is whole rather than at the end: a well-formed bundle
            // spells it first, and a reader that waited would have written thirty gigabytes before
            // saying it knows no such layout.
            if (final && collected === version) refuseUnknownVersion()
          } catch (thrown) {
            failure ??= thrown instanceof Error ? thrown : new Error(String(thrown))
          }
      }
      file.start()
      return
    }

    const entry = bundleEntryOf(file.name)
    // Another application's sidecar, or the folder marker every `zip -r` emits. Left unread rather
    // than refused: only an entry CLAIMING to be a medium and climbing out is hostile.
    if (entry.kind === 'ignored') return
    if (entry.kind === 'hostile') {
      failure ??= new BundleEscapeError(file.name)
      return
    }

    // Through the same pair the writing side uses: an archive may name two entries one file system
    // makes one file — `plan.mp4` twice, or `CON.mp4` on Windows — and the second would land on
    // the first's pixels with the cut pointing at both.
    const name = freeName(safeName(entry.name), taken)
    taken.add(name)

    const sink = createWriteStream(join(into, name))
    // A full disk emits `error` here with nothing listening, which Node raises as an uncaught
    // exception — it would take the bundle process down and every other job with it, under a
    // message naming the exit code rather than the disk. Settling `halted` is what wakes a read
    // waiting on a `drain` this sink will now never emit.
    const halted = new Promise<void>(resolve => {
      sink.on('error', error => {
        failure ??= error
        resolve()
      })
    })
    sinks.push(sink)
    media.push({ entry: file.name, file: name })
    file.ondata = (error, chunk, final) => {
      if (error) failure ??= error
      else if (grew(chunk.length)) drain(sink, halted, chunk, final)
    }
    file.start()
  }

  const room = async (): Promise<void> => {
    if (failure) throw failure
    if (signal?.aborted) throw new ImportCancelledError()
    if (!blocked) return

    const waiting = blocked
    blocked = null
    await waiting
  }

  try {
    await feedArchive(archive, total, unzip, room, onStep)
    await finishSinks(sinks)
    if (failure) throw failure

    if (version.bytes === 0 || content.bytes === 0) {
      throw new NotABundleError('this file carries no cut, so it is not a bundle')
    }
    // Again, for the archive that spells its version LAST: the early refusal never ran there.
    refuseUnknownVersion()

    return { content: strFromU8(joined(content)), media }
  } catch (error) {
    for (const sink of sinks) sink.destroy()
    if (error instanceof ImportCancelledError) return null
    throw error
  }
}
