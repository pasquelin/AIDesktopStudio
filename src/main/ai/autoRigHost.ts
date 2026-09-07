import type {
  AutoRigInferenceRequest,
  AutoRigInferenceResult,
  AutoRigProgressPhase,
  AutoRigProductError,
} from '@shared/domain/autoRigInference'
import type { LocalModel } from '@shared/domain/localModel'
import { modelRefusalOf } from '@shared/domain/localModel'
import { constants } from 'node:fs'
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { z } from 'zod'
import type { PythonClient } from './pythonClient'

const resultManifest = z.object({
  backendId: z.string(),
  jointNames: z.array(z.string()),
  parents: z.array(z.number().int()),
  vertices: z.number().int().positive(),
  files: z.object({
    heads: z.literal('heads.bin'),
    tails: z.literal('tails.bin'),
    weights: z.literal('weights.bin'),
    pose: z.literal('pose.bin'),
  }),
})

export class AutoRigFailure extends Error {
  constructor(
    readonly code: AutoRigProductError,
    cause?: unknown,
  ) {
    super(code, { cause })
  }
}

export type AutoRigHost = {
  run: (
    request: AutoRigInferenceRequest,
    signal: AbortSignal,
    onProgress: (ratio: number, phase: AutoRigProgressPhase) => void,
  ) => Promise<AutoRigInferenceResult>
}

type AutoRigHostDeps = {
  models: () => readonly LocalModel[]
  installedIds: () => ReadonlySet<string>
  ensureLoaded: (modelId: string) => Promise<void>
  hold: (modelId: string) => () => void
  engine: () => Promise<PythonClient | null>
}

export function createAutoRigHost(deps: AutoRigHostDeps): AutoRigHost {
  return {
    run: (request, signal, onProgress) => runAutoRig(deps, request, signal, onProgress),
  }
}

async function runAutoRig(
  deps: AutoRigHostDeps,
  request: AutoRigInferenceRequest,
  signal: AbortSignal,
  onProgress: (ratio: number, phase: AutoRigProgressPhase) => void,
): Promise<AutoRigInferenceResult> {
  const model = deps.models().find(candidate => candidate.backendId === request.backendId)
  if (!model || modelRefusalOf(model) !== null) throw new AutoRigFailure('ENGINE_UNAVAILABLE')
  if (!deps.installedIds().has(model.id)) throw new AutoRigFailure('MODEL_NOT_INSTALLED')
  if (signal.aborted) throw new AutoRigFailure('CANCELLED')
  const folder = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-autorig-'))
  const release = deps.hold(model.id)
  try {
    onProgress(0, 'prepare')
    const source = await stageInput(folder, request)
    const { engine, loadMs } = await loadedEngine(deps, model.id, signal, onProgress)
    const destination = join(folder, 'result')
    const settled = await runInference(engine, source, destination, signal, onProgress)
    if (signal.aborted) throw new AutoRigFailure('CANCELLED')
    return await readResult(destination, request, {
      device: settled.device ?? 'unknown',
      loadMs,
      inferenceMs: settled.generateMs ?? null,
      peakRssBytes: settled.peakRssBytes ?? null,
    })
  } finally {
    release()
    await rm(folder, { recursive: true, force: true })
  }
}

async function loadedEngine(
  deps: AutoRigHostDeps,
  modelId: string,
  signal: AbortSignal,
  onProgress: (ratio: number, phase: AutoRigProgressPhase) => void,
): Promise<{ engine: PythonClient; loadMs: number }> {
  const started = performance.now()
  onProgress(0, 'load')
  try {
    await deps.ensureLoaded(modelId)
  } catch (error) {
    throw failureOf(error, signal, 'ENGINE_UNAVAILABLE')
  }
  const engine = await deps.engine()
  if (!engine) throw new AutoRigFailure('ENGINE_UNAVAILABLE')
  return { engine, loadMs: performance.now() - started }
}

async function runInference(
  engine: PythonClient,
  source: string,
  destination: string,
  signal: AbortSignal,
  onProgress: (ratio: number, phase: AutoRigProgressPhase) => void,
) {
  try {
    return await engine.job(
      'auto-rig',
      { source, destination, door: 'engine/3d' },
      { signal, onStep: (ratio, phase) => onProgress(ratio, progressPhaseOf(phase)) },
    )
  } catch (error) {
    throw failureOf(error, signal, 'INFERENCE_FAILED')
  }
}

async function stageInput(folder: string, request: AutoRigInferenceRequest): Promise<string> {
  const positions = 'positions.bin'
  const triangles = 'triangles.bin'
  await Promise.all([
    writeFile(join(folder, positions), request.positions),
    writeFile(join(folder, triangles), request.triangles),
  ])
  const source = join(folder, 'input.json')
  await writeFile(
    source,
    JSON.stringify({
      positions,
      triangles,
      primitives: request.primitives,
      options: request.options,
    }),
    'utf8',
  )
  return source
}

async function readResult(
  folder: string,
  request: AutoRigInferenceRequest,
  metrics: Pick<AutoRigInferenceResult, 'device' | 'loadMs' | 'inferenceMs' | 'peakRssBytes'>,
): Promise<AutoRigInferenceResult> {
  const manifest = resultManifest.parse(JSON.parse(await readTextFile(folder, 'result.json')))
  if (manifest.backendId !== request.backendId) throw new AutoRigFailure('INFERENCE_FAILED')
  if (
    manifest.vertices !== request.positions.length / 3 ||
    manifest.parents.length !== manifest.jointNames.length
  )
    throw new AutoRigFailure('INFERENCE_FAILED')
  const vectorBytes = manifest.jointNames.length * 3 * Float32Array.BYTES_PER_ELEMENT
  const weightBytes =
    manifest.vertices * manifest.jointNames.length * Float32Array.BYTES_PER_ELEMENT
  const [heads, tails, weights] = await Promise.all([
    readFloat32(folder, manifest.files.heads, vectorBytes),
    readFloat32(folder, manifest.files.tails, vectorBytes),
    readFloat32(folder, manifest.files.weights, weightBytes),
  ])
  if (
    heads.byteLength !== vectorBytes ||
    tails.byteLength !== vectorBytes ||
    weights.byteLength !== weightBytes
  )
    throw new AutoRigFailure('INFERENCE_FAILED')
  const identity = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
  return {
    jointNames: manifest.jointNames,
    parents: Int16Array.from(manifest.parents),
    joints: heads,
    tails,
    weights,
    sourceInfluences: manifest.jointNames.length,
    modelToInput: identity,
    inputToModel: identity.slice(),
    primitives: request.primitives,
    ...metrics,
  }
}

async function readFloat32(
  folder: string,
  name: string,
  maximumBytes: number,
): Promise<Float32Array> {
  const bytes = await readControlledFile(folder, name, maximumBytes)
  if (bytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0)
    throw new AutoRigFailure('INFERENCE_FAILED')
  return new Float32Array(bytes.buffer)
}

async function readTextFile(folder: string, name: string): Promise<string> {
  return new TextDecoder().decode(await readControlledFile(folder, name, 1024 * 1024))
}

async function readControlledFile(
  folder: string,
  name: string,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (typeof constants.O_NOFOLLOW !== 'number') throw new AutoRigFailure('ENGINE_UNAVAILABLE')
  const handle = await open(join(folder, name), constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const details = await handle.stat()
    if (!details.isFile() || details.size > maximumBytes)
      throw new AutoRigFailure('INFERENCE_FAILED')
    const bytes = new Uint8Array(maximumBytes + 1)
    let offset = 0
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (bytesRead === 0) break
      offset += bytesRead
    }
    if (offset > maximumBytes) throw new AutoRigFailure('INFERENCE_FAILED')
    return bytes.slice(0, offset)
  } finally {
    await handle.close()
  }
}

function progressPhaseOf(value: string | undefined): AutoRigProgressPhase {
  if (
    value === 'prepare' ||
    value === 'analyse' ||
    value === 'skeleton' ||
    value === 'pose' ||
    value === 'skinning'
  )
    return value
  return 'apply'
}

function failureOf(
  error: unknown,
  signal: AbortSignal,
  fallback: AutoRigProductError,
): AutoRigFailure {
  if (signal.aborted || String(error).includes('cancelled') || String(error).includes('CANCELLED'))
    return new AutoRigFailure('CANCELLED', error)
  const message = String(error)
  if (/memory|alloc/i.test(message)) return new AutoRigFailure('OUT_OF_MEMORY', error)
  if (message.includes('INVALID_MESH')) return new AutoRigFailure('INVALID_MESH', error)
  if (message.includes('does not support')) return new AutoRigFailure('UNSUPPORTED_PLATFORM', error)
  if (/digest|corrupt|incomplete/i.test(message)) return new AutoRigFailure('MODEL_INVALID', error)
  return new AutoRigFailure(fallback, error)
}
