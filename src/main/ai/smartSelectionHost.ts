import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  SMART_SELECTION_MODEL,
  type SmartSelectionRequest,
  type SmartSelectionResult,
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
  loadedEpoch: (modelId: string) => number | null
  /** The mask back as BGRA. Injected: it needs a live app to reach `nativeImage`. */
  readBitmap: (file: string) => Promise<Uint8Array | null>
}): SmartSelectionHost {
  let encoded: { revision: string; epoch: number | null; engine: PythonClient } | null = null
  const queue = writeQueue()
  const run = async (
    request: SmartSelectionRequest,
    signal: AbortSignal,
  ): Promise<SmartSelectionResult> => {
    signal.throwIfAborted()
    // Both the composite going in and the mask coming back travel as files, so the folder is
    // wanted on every run — where only an encoding the engine did not hold used to need one.
    const folder = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-selection-'))
    const destination = join(folder, 'mask.png')
    const release = deps.hold(SMART_SELECTION_MODEL)
    try {
      await deps.ensureLoaded(SMART_SELECTION_MODEL)
      const engine = await deps.engine()
      if (!engine) throw new Error('the local AI engine is not answering')
      const epoch = deps.loadedEpoch(SMART_SELECTION_MODEL)
      const encode = async (): Promise<void> => {
        const image = join(folder, 'composite.png')
        await writeFile(image, request.png)
        await engine.job('selection.encode', { door: 'engine/selection', image }, { signal })
        signal.throwIfAborted()
        encoded = { revision: request.revision, epoch, engine }
      }
      const decode = async (): Promise<unknown> => {
        const answer = await engine.job(
          'selection.decode',
          { door: 'engine/selection', destination, ...promptOf(request) },
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
        return await maskOf(await decode(), deps.readBitmap)
      } catch (error) {
        // 🛑 The engine let the model go between two clicks — an idle unload, or another model
        // taking the room — and its embedding went with it: only the studio still believed in
        // one. Encoded again rather than answered with a failure nobody can act on.
        if (!lostEmbedding(error)) throw error
        encoded = null
        await encode()
        return await maskOf(await decode(), deps.readBitmap)
      }
    } finally {
      release()
      await rm(folder, { recursive: true, force: true })
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

const invalid = (): Error => new Error('the selection engine returned an invalid mask')

async function maskOf(
  result: unknown,
  readBitmap: (file: string) => Promise<Uint8Array | null>,
): Promise<SmartSelectionResult> {
  if (
    !result ||
    typeof result !== 'object' ||
    !('mask' in result) ||
    !('width' in result) ||
    !('height' in result) ||
    typeof result.mask !== 'string' ||
    typeof result.width !== 'number' ||
    typeof result.height !== 'number'
  )
    throw invalid()

  const { width, height } = result
  const bitmap = await readBitmap(result.mask)
  if (!bitmap || bitmap.byteLength !== width * height * 4) throw invalid()

  // The mask is grey, so the four channels carry the same value and the first answers for all.
  const alpha = new Uint8Array(width * height)
  for (let at = 0; at < alpha.length; at += 1) alpha[at] = bitmap[at * 4] ?? 0
  return { width, height, alpha }
}

/** What the door answers once its model has been unloaded — see `EfficientSam.decode`. */
const lostEmbedding = (error: unknown): boolean =>
  error instanceof Error && error.message.includes('no embedding')
