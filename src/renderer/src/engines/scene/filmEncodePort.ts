import FilmEncodeWorker from './filmEncode.worker?worker'
import { createWorkerSession } from '../core/workerSession'
import type { FilmEncodeRequest, FilmEncodeResponse } from './filmEncodeMessage'

const session = createWorkerSession<FilmEncodeRequest, FilmEncodeResponse>(
  () => new FilmEncodeWorker(),
)

/** Transfers a disposable GPU readback buffer, then flips and PNG-encodes it off the UI thread. */
export async function encodeFilmFrameOffThread(
  pixels: Uint8Array,
  width: number,
  height: number,
  encoded = false,
): Promise<Uint8Array> {
  const id = session.nextId()
  const answer = await session.send(
    { id, pixels, width, height, encoded } satisfies FilmEncodeRequest,
    [pixels.buffer],
  )
  if ('failure' in answer) throw new Error(answer.failure)
  return answer.bytes
}
