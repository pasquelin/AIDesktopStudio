import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  SmartSelectionRequest,
  SmartSelectionResult,
} from '@shared/domain/smartSelectionInference'
import { writeQueue } from '@main/persistence'
import type { PythonClient } from './pythonClient'

export type SmartSelectionHost = {
  run: (request: SmartSelectionRequest, signal: AbortSignal) => Promise<SmartSelectionResult>
}

export function createSmartSelectionHost(deps: {
  ensureLoaded: (modelId: string) => Promise<void>
  hold: (modelId: string) => () => void
  engine: () => Promise<PythonClient | null>
  epoch: () => number | null
}): SmartSelectionHost {
  let encoded: { revision: string; epoch: number | null; engine: PythonClient } | null = null
  const queue = writeQueue()
  const run = async (
    request: SmartSelectionRequest,
    signal: AbortSignal,
  ): Promise<SmartSelectionResult> => {
    signal.throwIfAborted()
    let folder: string | null = null
    const release = deps.hold('efficient-sam-ti')
    try {
      await deps.ensureLoaded('efficient-sam-ti')
      const engine = await deps.engine()
      if (!engine) throw new Error('the local AI engine is not answering')
      // The picture only touches the disk for an encoding the engine does not hold yet.
      const epoch = deps.epoch()
      const encode = async (): Promise<void> => {
        folder ??= await mkdtemp(join(tmpdir(), 'ai-desktop-studio-selection-'))
        const image = join(folder, 'composite.png')
        await writeFile(image, request.png)
        await engine.job('selection.encode', { door: 'engine/selection', image }, { signal })
        signal.throwIfAborted()
        encoded = { revision: request.revision, epoch, engine }
      }
      const decode = async (): Promise<unknown> => {
        const answer = await engine.job(
          'selection.decode',
          { door: 'engine/selection', ...promptOf(request) },
          { signal },
        )
        signal.throwIfAborted()
        return answer
      }

      if (
        encoded?.revision !== request.revision ||
        encoded.epoch !== epoch ||
        encoded.engine !== engine
      )
        await encode()
      try {
        return maskOf(await decode())
      } catch (error) {
        // 🛑 The engine let the model go between two clicks — an idle unload, or another model
        // taking the room — and its embedding went with it: only the studio still believed in
        // one. Encoded again rather than answered with a failure nobody can act on.
        if (!lostEmbedding(error)) throw error
        encoded = null
        await encode()
        return maskOf(await decode())
      }
    } finally {
      release()
      if (folder) await rm(folder, { recursive: true, force: true })
    }
  }

  return {
    run: (request, signal) => queue.next(() => run(request, signal)),
  }
}

function promptOf(request: SmartSelectionRequest): Record<string, number[]> {
  if ('point' in request.prompt) return { point: [request.prompt.point.x, request.prompt.point.y] }
  const { x, y, width, height } = request.prompt.box
  return { box: [x, y, x + width, y + height] }
}

function maskOf(result: unknown): SmartSelectionResult {
  if (
    !result ||
    typeof result !== 'object' ||
    !('alpha' in result) ||
    !('width' in result) ||
    !('height' in result) ||
    typeof result.alpha !== 'string' ||
    typeof result.width !== 'number' ||
    typeof result.height !== 'number'
  )
    throw new Error('the selection engine returned an invalid mask')
  // One byte per pixel: `match(/.{2}/g)` allocated a two-character string per pixel, measured at
  // 127 ms and 130 MB on a 1920×1080 mask against 1.4 ms and 2 MB here — on the main process.
  const alpha = Buffer.from(result.alpha, 'hex')
  if (alpha.byteLength !== result.width * result.height)
    throw new Error('the selection engine returned an invalid mask')
  return { width: result.width, height: result.height, alpha }
}

/** What the door answers once its model has been unloaded — see `EfficientSam.decode`. */
const lostEmbedding = (error: unknown): boolean =>
  error instanceof Error && error.message.includes('no embedding')
