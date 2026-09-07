import {
  reliefChunkRowsInDisk,
  withPackedChunks,
  type PackedReliefChunk,
  type ReliefExtent,
  type ReliefMask,
  type ReliefOverlay,
  type ReliefSculpt,
  type ReliefSculptOperation,
} from '@shared/domain/relief'
import type { HeightmapSamples } from '@shared/domain/heightmap'
import { createWorkerSession } from '../core/workerSession'
import type { ReliefSculptRequest, ReliefSculptResponse } from './reliefSculptMessage'
import { evenRange } from '../core/evenRange'
import { workerPoolSize } from '../core/workerPoolSize'

export type ReliefDiskStroke = {
  samples: HeightmapSamples
  extent: ReliefExtent
  grain: number
  sculpt: ReliefSculpt | undefined
  disk: { x: number; z: number; radius: number }
  amount: number
  falloff?: number
  kind?: ReliefSculptOperation['kind']
  target?: number
  overlays?: readonly ReliefOverlay[]
  overlayAlpha?: number
  overlayMask?: ReliefMask
}

export type ReliefSculptor = {
  /** Queued, never coalesced: each disk ADDS, and dropping an in-between stroke would skip terrain. */
  raiseDisk: (stroke: ReliefDiskStroke) => Promise<PackedReliefChunk[] | null>
  /**
   * An outside write (undo, reload). Drops the queue and the in-flight answer so a late worker
   * cannot paint over the sculpt the user just restored.
   */
  note: (sculpt: ReliefSculpt | undefined) => void
  dispose: () => void
}

type Job = ReliefDiskStroke & {
  resolve: (edits: PackedReliefChunk[] | null) => void
  reject: (error: Error) => void
}
type SculptSession = ReturnType<
  typeof createWorkerSession<ReliefSculptRequest, ReliefSculptResponse>
>
type BaseBindings = {
  nextId: number
  bySession: Map<SculptSession, { id: number; width: number; height: number; values: Float32Array }>
}

const CHUNK_ROWS_PER_WORKER = 2

export function createReliefSculptor(
  spawn: () => Worker,
  maximumWorkers = workerPoolSize(),
): ReliefSculptor {
  const sessions = Array.from({ length: Math.max(1, Math.floor(maximumWorkers)) }, () =>
    createWorkerSession<ReliefSculptRequest, ReliefSculptResponse>(spawn),
  )
  const queue: Job[] = []
  let generation = 0
  let bound: ReliefSculpt | undefined
  let heldAfter: ReliefSculpt | undefined
  let busy = false
  const bases: BaseBindings = { nextId: 0, bySession: new Map() }

  const dropQueue = (): void => {
    for (const job of queue) job.resolve(null)
    queue.length = 0
  }

  const invalidate = (): void => {
    generation += 1
    heldAfter = undefined
    dropQueue()
  }

  const pump = async (): Promise<void> => {
    if (busy) return
    const job = queue.shift()
    if (!job) return

    busy = true
    const token = generation
    const before = heldAfter ?? job.sculpt
    try {
      const responses = await sculptResponses(job, before, sessions, bases)
      if (token !== generation) {
        job.resolve(null)
        return
      }
      const failed = responses.find(response => !response.ok)
      if (failed && !failed.ok) {
        rejectWorkerFailure(job, failed.error, bases)
        return
      }
      const edits = responses.flatMap(response => (response.ok ? response.chunks : []))
      heldAfter = withPackedChunks(before, edits)
      bound = heldAfter
      job.resolve(edits)
    } catch (error) {
      if (token !== generation) job.resolve(null)
      else job.reject(error instanceof Error ? error : new Error(String(error)))
    } finally {
      busy = false
      void pump()
    }
  }

  return {
    raiseDisk: stroke =>
      new Promise((resolve, reject) => {
        queue.push({ ...stroke, resolve, reject })
        void pump()
      }),
    note: sculpt => {
      if (sameSculpt(sculpt, heldAfter)) {
        bound = sculpt
        return
      }
      if (sameSculpt(sculpt, bound)) return
      invalidate()
      bound = sculpt
    },
    dispose: () => {
      invalidate()
      sessions.forEach(session => session.dispose())
      bases.bySession.clear()
    },
  }
}

function rejectWorkerFailure(job: Job, error: string, bases: BaseBindings): void {
  bases.bySession.clear()
  job.reject(new Error(error))
}

async function sculptResponses(
  job: Job,
  before: ReliefSculpt | undefined,
  sessions: readonly SculptSession[],
  bases: BaseBindings,
): Promise<ReliefSculptResponse[]> {
  const ranges = rowRanges(job, sessions.length)
  return Promise.all(
    ranges.map((rows, index) =>
      sculptResponse(job, before, rows, ranges.length, sessions[index], bases),
    ),
  )
}

async function sculptResponse(
  job: Job,
  before: ReliefSculpt | undefined,
  rows: { from: number; to: number },
  rangeCount: number,
  session: SculptSession | undefined,
  bases: BaseBindings,
): Promise<ReliefSculptResponse> {
  if (!session) throw new Error('Relief sculpt worker is unavailable')
  const held = bases.bySession.get(session)
  const binding = bindingOf(job, held, bases)
  if (binding) bases.bySession.set(session, binding)
  try {
    return await session.send(requestOf(job, before, rows, rangeCount, session, held, binding))
  } catch (error) {
    bases.bySession.delete(session)
    throw error
  }
}

type BaseBinding =
  BaseBindings['bySession'] extends Map<SculptSession, infer Binding> ? Binding : never

function bindingOf(
  job: Job,
  held: BaseBinding | undefined,
  bases: BaseBindings,
): BaseBinding | undefined {
  if (!readsCombined(job.kind)) return undefined
  if (
    held?.values === job.samples.values &&
    held.width === job.samples.width &&
    held.height === job.samples.height
  ) {
    return held
  }
  return {
    id: (bases.nextId += 1),
    width: job.samples.width,
    height: job.samples.height,
    values: job.samples.values,
  }
}

function requestOf(
  job: Job,
  before: ReliefSculpt | undefined,
  rows: { from: number; to: number },
  rangeCount: number,
  session: SculptSession,
  held: BaseBinding | undefined,
  binding: BaseBinding | undefined,
): ReliefSculptRequest {
  return {
    id: session.nextId(),
    width: job.samples.width,
    height: job.samples.height,
    extent: job.extent,
    grain: job.grain,
    sculpt: rangeCount === 1 ? before : slicedSculpt(before, rows),
    operation: operationOf(job),
    rows: rangeCount === 1 ? undefined : rows,
    overlayAlpha: job.overlayAlpha,
    overlayMask: job.overlayMask,
    ...(binding
      ? {
          baseId: binding.id,
          ...(binding !== held ? { values: job.samples.values } : {}),
          overlays: job.overlays,
        }
      : {}),
  }
}

function slicedSculpt(
  before: ReliefSculpt | undefined,
  rows: { from: number; to: number },
): ReliefSculpt {
  return {
    chunks: before?.chunks.filter(chunk => chunk.row >= rows.from && chunk.row < rows.to) ?? [],
  }
}

function operationOf(stroke: ReliefDiskStroke): ReliefSculptOperation {
  const falloff = stroke.falloff ?? 0
  if (stroke.kind === 'smooth') {
    return { kind: 'smooth', disk: stroke.disk, amount: stroke.amount, falloff }
  }
  if (stroke.kind === 'flatten') {
    return {
      kind: 'flatten',
      disk: stroke.disk,
      amount: stroke.amount,
      falloff,
      target: stroke.target ?? 0,
    }
  }
  if (stroke.kind === 'paintMask') {
    return { kind: 'paintMask', disk: stroke.disk, amount: stroke.amount, falloff }
  }
  return { kind: 'raiseDisk', disk: stroke.disk, amount: stroke.amount, falloff }
}

function readsCombined(kind: ReliefSculptOperation['kind'] | undefined): boolean {
  return kind === 'smooth' || kind === 'flatten'
}

function rowRanges(
  stroke: ReliefDiskStroke,
  maximumWorkers: number,
): { from: number; to: number }[] {
  const { from, to } = reliefChunkRowsInDisk(
    stroke.samples,
    stroke.extent,
    stroke.disk,
    stroke.grain,
  )
  // Smooth reads a 1-ring; splitting by rows would drop the neighbour on the far side of the cut.
  if (readsCombined(stroke.kind)) return [{ from, to }]
  const workers = Math.min(
    maximumWorkers,
    Math.max(1, Math.ceil((to - from) / CHUNK_ROWS_PER_WORKER)),
  )
  return Array.from({ length: workers }, (_, worker) => evenRange(to - from, workers, worker, from))
}

function sameSculpt(left: ReliefSculpt | undefined, right: ReliefSculpt | undefined): boolean {
  if (left === right) return true
  if (!left || !right || left.chunks.length !== right.chunks.length) {
    return false
  }
  const keys = new Set(left.chunks.map(chunk => `${chunk.column}:${chunk.row}:${chunk.payload}`))
  return right.chunks.every(chunk => keys.has(`${chunk.column}:${chunk.row}:${chunk.payload}`))
}
