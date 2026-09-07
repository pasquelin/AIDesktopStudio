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
}): SmartSelectionHost {
  let encodedRevision: string | null = null
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
      if (encodedRevision !== request.revision) {
        folder = await mkdtemp(join(tmpdir(), 'ia-studio-selection-'))
        const image = join(folder, 'composite.png')
        await writeFile(image, request.png)
        await engine.job('selection.encode', { door: 'engine/selection', image }, { signal })
        signal.throwIfAborted()
        encodedRevision = request.revision
      }
      const decoded = await engine.job(
        'selection.decode',
        { door: 'engine/selection', ...promptOf(request) },
        { signal },
      )
      signal.throwIfAborted()
      return maskOf(decoded)
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
  const alpha = Uint8Array.from(
    result.alpha.match(/.{2}/g)?.map(value => Number.parseInt(value, 16)) ?? [],
  )
  if (alpha.byteLength !== result.width * result.height)
    throw new Error('the selection engine returned an invalid mask')
  return { width: result.width, height: result.height, alpha }
}
