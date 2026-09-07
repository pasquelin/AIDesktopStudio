import { createHash } from 'node:crypto'
import {
  isSuppliedModel,
  needsOwnFolder,
  PART_SUFFIX,
  type DownloadProgress,
  type LocalModel,
  type ModelFile,
} from '@shared/domain/localModel'
// The same floor every long task in this studio reports on: `net.fetch` hands out a few tens of
// kilobytes at a time, and reporting each would push twenty thousand events through the IPC for
// the encoder alone — each broadcast to every window, to move a bar of sixty steps.
import { PROGRESS_STEP } from '@shared/domain/taskProgress'
import { pathParentOf } from '@shared/domain/fileName'

/**
 * Installing any local model — the dictation downloader, freed from the dictation.
 *
 * It was written for one model and is now handed the manifest: the integrity chain is unchanged,
 * only what it applies to. The stream is what makes the size bearable — one file alone is 652 MB,
 * and holding it in memory to hash it would cost more than the download.
 */
export type DownloadHost = {
  /** Answers the status, the headers that matter, and the body as a stream of chunks. */
  fetch: (url: string, range: number, signal?: AbortSignal) => Promise<DownloadResponse>
  /** How much of a partial file is already on disk. `0` when there is none. */
  sizeOf: (path: string) => Promise<number>
  /**
   * Opens a `.part` for writing — appending when `resume`, truncating otherwise — and answers
   * the handle to write through.
   *
   * A handle rather than a `write(path, chunk)`: `appendFile` opens and closes the file on
   * every call, which for one large file would be sixty thousand syscalls.
   */
  open: (path: string, resume: boolean) => Promise<DownloadSink>
  /** Reads a `.part` back, in chunks, to hash what was downloaded before this run. */
  readBack: (path: string) => AsyncIterable<Uint8Array>
  remove: (path: string) => Promise<void>
  /** The atomic step. Nothing reads the final name until it holds a verified file. */
  rename: (from: string, to: string) => Promise<void>
  exists: (path: string) => Promise<boolean>
  join: (folder: string, name: string) => string
  /**
   * Creates the folder a file is about to be written into, parents included.
   *
   * A manifest file name may carry a PATH — `transformer/diffusion_pytorch_model.safetensors` is
   * how a diffusers model is laid out, and the loader reads that shape rather than a flat folder.
   * Without this the download fails on the first nested name with an ENOENT nobody can read.
   */
  ensureFolder: (folder: string) => Promise<void>
}

/** An open `.part`, for the length of one file. */
type DownloadSink = {
  write: (chunk: Uint8Array) => Promise<void>
  close: () => Promise<void>
}

export type DownloadResponse = {
  ok: boolean
  status: number
  /** True when the server honoured the `Range` header — 206 rather than 200. */
  partial: boolean
  body: AsyncIterable<Uint8Array>
}

export type DownloadOptions = {
  folder: string
  signal?: AbortSignal
  onProgress: (progress: DownloadProgress) => void
}

/** Refused by the download itself, as opposed to a network that simply failed. */
export class ChecksumMismatch extends Error {}

export class DownloadCancelled extends Error {}

/** The connection dropped mid-file. The `.part` stays, so the next try resumes. */
export class NetworkInterrupted extends Error {}

const NETWORK_MARKS = [
  'net::ERR_',
  'ENOTFOUND',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'socket hang up',
]

export function isNetworkError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return NETWORK_MARKS.some(mark => text.includes(mark))
}

function rethrowNetwork(error: unknown, file: string): never {
  if (error instanceof DownloadCancelled || error instanceof ChecksumMismatch) throw error
  if (isNetworkError(error)) {
    throw new NetworkInterrupted(
      `${file}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  throw error
}

const partOf = (path: string): string => `${path}${PART_SUFFIX}`

function abortIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DownloadCancelled('the model download was cancelled')
}

async function responseFor(
  host: DownloadHost,
  file: ModelFile,
  asked: number,
  signal: AbortSignal | undefined,
): Promise<DownloadResponse> {
  try {
    const response = await host.fetch(file.url, asked, signal)
    if (!response.ok) throw new Error(`${file.name} answered ${response.status}`)
    return response
  } catch (error) {
    abortIfCancelled(signal)
    rethrowNetwork(error, file.name)
  }
}

async function seedDigest(
  host: Pick<DownloadHost, 'readBack'>,
  part: string,
  resuming: boolean,
  signal: AbortSignal | undefined,
  onBytes?: (bytes: number) => void,
): Promise<{ digest: ReturnType<typeof createHash>; received: number }> {
  const digest = createHash('sha256')
  let received = 0
  if (resuming)
    for await (const chunk of host.readBack(part)) {
      abortIfCancelled(signal)
      digest.update(chunk)
      received += chunk.byteLength
      onBytes?.(chunk.byteLength)
    }
  return { digest, received }
}

export async function fingerprintModelFile(
  readBack: DownloadHost['readBack'],
  path: string,
  signal?: AbortSignal,
  onBytes?: (bytes: number) => void,
): Promise<{ bytes: number; sha256: string }> {
  const { digest, received } = await seedDigest({ readBack }, path, true, signal, onBytes)
  return { bytes: received, sha256: digest.digest('hex') }
}

async function writeResponse(
  host: DownloadHost,
  file: ModelFile,
  response: DownloadResponse,
  part: string,
  resuming: boolean,
  options: DownloadOptions & { alreadyDone: number; total: number },
  seeded: Awaited<ReturnType<typeof seedDigest>>,
): Promise<{ received: number; reported: number }> {
  let { received } = seeded
  let reported = received
  const sink = await host.open(part, resuming)
  try {
    for await (const chunk of response.body) {
      abortIfCancelled(options.signal)
      await sink.write(chunk)
      seeded.digest.update(chunk)
      received += chunk.byteLength
      if (received - reported >= PROGRESS_STEP) {
        reported = received
        options.onProgress({ received: options.alreadyDone + received, total: options.total })
      }
    }
  } catch (error) {
    abortIfCancelled(options.signal)
    rethrowNetwork(error, file.name)
  } finally {
    await sink.close()
  }
  return { received, reported }
}

/**
 * Fetches one file, resuming a `.part` when there is one.
 *
 * The digest is computed as the bytes go past rather than by reading the file back at the end,
 * except for what a previous run already wrote — which has to be hashed on resume, since the
 * hash of a stream cannot be started in the middle.
 */
export async function fetchModelFile(
  host: DownloadHost,
  file: ModelFile,
  options: DownloadOptions & { alreadyDone: number; total: number },
): Promise<void> {
  const target = host.join(options.folder, file.name)
  const part = partOf(target)

  abortIfCancelled(options.signal)

  await host.ensureFolder(pathParentOf(target))

  const onDisk = await host.sizeOf(part)
  // A `.part` at least as long as the file it claims to be is not a resume point: the URL
  // rotated, or two runs wrote at once. Starting over costs a download; trusting it would cost
  // a model that loads and recognises nothing.
  const asked = onDisk > 0 && onDisk < file.bytes ? onDisk : 0

  const response = await responseFor(host, file, asked, options.signal)

  // Resumed only if the server actually honoured the range. Asked to resume and served the
  // whole file, what is on disk is not a prefix of what is arriving — so it is dropped rather
  // than appended to, which would build a wrong file that only says so at the digest.
  const resuming = asked > 0 && response.partial
  const seeded = await seedDigest(host, part, resuming, options.signal)
  const { digest } = seeded
  const { received, reported } = await writeResponse(
    host,
    file,
    response,
    part,
    resuming,
    options,
    seeded,
  )

  if (received > reported) {
    options.onProgress({ received: options.alreadyDone + received, total: options.total })
  }

  if (digest.digest('hex') !== file.sha256) {
    // Removed, not kept for a retry: a file that failed its digest has nothing worth resuming,
    // and leaving it would have the next run resume from corruption.
    await host.remove(part)
    throw new ChecksumMismatch(`${file.name} does not match its recorded digest`)
  }

  await host.rename(part, target)
}

/**
 * Fetches whatever is missing from a model's folder, one file at a time.
 *
 * Sequential on purpose: four parallel streams of a 652 MB file over one connection finish no
 * sooner and make the progress bar meaningless. Progress counts bytes across the whole model,
 * not within the file being fetched — the same rule the media ingest follows.
 */
export async function fetchModel(
  host: DownloadHost,
  model: LocalModel,
  options: DownloadOptions,
): Promise<void> {
  const total = model.diskBytes
  let done = 0

  for (const file of model.files) {
    const target = host.join(options.folder, file.name)
    const held = await host.sizeOf(target)
    if (held === file.bytes) {
      done += file.bytes
      options.onProgress({ received: done, total })
      continue
    }

    // A name at the final path with the wrong size is not a resume point: only `.part` is.
    // Leaving it would skip the fetch forever (`exists` used to, and a cut download then
    // loaded as if the model were whole).
    if (held > 0) await host.remove(target)

    await fetchModelFile(host, file, { ...options, alreadyDone: done, total })
    done += file.bytes
  }
}

/**
 * Whether every file of a model is present AND the size the manifest named.
 *
 * Digests are not re-checked here: they were verified before the rename, and re-reading hundreds
 * of megabytes on every start would cost seconds of disk for files nothing else writes. Size is
 * the cheap check that still catches a cut download sitting at the final path.
 */
export async function modelIsComplete(
  host: DownloadHost,
  model: LocalModel,
  folder: string,
): Promise<boolean> {
  // A model the person supplied is installed exactly while THEIR file is there: nothing was
  // fetched into the model folder, and looking for it in there would read as never installed.
  if (isSuppliedModel(model) && !needsOwnFolder(model.loader))
    return await host.exists(model.weightsPath)

  // `every` of nothing is true. Right for Ollama, which lists what it holds; a lie for a card
  // listed before its engine exists.
  if (model.files.length === 0) return model.loader === 'ollama'

  // 🛑 `[M]` The folder first, for a loader that owns one: the catalogue holds 507 files across
  // 40 models, 500 of them behind a folder that does not exist until something is installed —
  // so a machine with nothing on it paid 507 stats per compose to answer "no".
  if (needsOwnFolder(model.loader) && !(await host.exists(folder))) return false

  // At once, and the lost short-circuit costs nothing: a `stat` that fails is as cheap as one that
  // succeeds, and this sits on every compose — so on every assistant turn, four latencies deep on
  // a model folder the setting lets someone point at an external disk.
  const sizes = await Promise.all(
    model.files.map(async file => ({
      expected: file.bytes,
      actual: await host.sizeOf(host.join(folder, file.name)),
    })),
  )

  return sizes.every(one => one.actual === one.expected)
}
