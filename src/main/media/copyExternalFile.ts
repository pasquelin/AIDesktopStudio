import { constants, createReadStream, createWriteStream } from 'node:fs'
import { open, rm, stat, unlink } from 'node:fs/promises'
import { Transform, type TransformCallback } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { steppedProgress, type TaskWatch } from '@shared/domain/taskProgress'
import { orElse } from '@shared/promises'
import { pathIsInside } from '@main/export/pathIsInside'

export async function removeExternalCopy(path: string): Promise<void> {
  await orElse(unlink(path), undefined)
}

async function writeCopy(
  source: NodeJS.ReadableStream,
  destination: string,
  size: number,
  { onStep, signal }: TaskWatch,
): Promise<boolean> {
  if (signal?.aborted) return false
  const progress = steppedProgress(size, onStep)
  const meter = new Transform({
    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      progress(chunk.length)
      callback(null, chunk)
    },
  })
  const destinationHandle = await open(destination, 'wx')
  try {
    await pipeline(
      source,
      meter,
      createWriteStream(destination, { fd: destinationHandle.fd, autoClose: false }),
      { signal },
    )
    await destinationHandle.close()
    return true
  } catch (error) {
    await orElse(destinationHandle.close(), undefined)
    await removeExternalCopy(destination)
    if (signal?.aborted) return false
    throw error
  }
}

export async function copyExternalFile(
  source: string,
  destination: string,
  watch: TaskWatch,
  { follow = true }: { follow?: boolean } = {},
): Promise<boolean> {
  if (watch.signal?.aborted) return false
  if (follow) {
    const size = (await stat(source)).size
    return await writeCopy(createReadStream(source), destination, size, watch)
  }
  if (typeof constants.O_NOFOLLOW !== 'number') return false
  const sourceHandle = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const details = await sourceHandle.stat()
    if (!details.isFile()) return false
    return await writeCopy(
      createReadStream(source, { fd: sourceHandle.fd, autoClose: false }),
      destination,
      details.size,
      watch,
    )
  } finally {
    await orElse(sourceHandle.close(), undefined)
  }
}

/** A document that arrived with siblings owns its folder, so a refusal takes the folder with it. */
export async function removeExternalFolder(path: string, inside?: string): Promise<void> {
  if (inside !== undefined && !pathIsInside(inside, path)) return
  await orElse(rm(path, { recursive: true, force: true }), undefined)
}
