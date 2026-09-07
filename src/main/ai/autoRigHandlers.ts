import { CHANNELS, EVENTS } from '@shared/ipc'
import { z } from 'zod'
import { handle } from '@main/ipc/handle'
import { broadcast } from '@main/ipc/broadcast'
import type { RunningTasks } from '@main/task/runningTasks'
import type { AutoRigHost } from './autoRigHost'
import { MAX_MESH_BYTES } from '@main/project/validation'
import type { AutoRigInferenceRequest } from '@shared/domain/autoRigInference'

const primitive = z.object({
  mesh: z.number().int().nonnegative(),
  primitive: z.number().int().nonnegative(),
  vertexOffset: z.number().int().nonnegative(),
  vertexCount: z.number().int().positive(),
})

const options = z.object({
  fingers: z.enum(['detailed', 'simplified']),
  useSurfaceNormals: z.boolean(),
  weightPostProcessing: z.boolean(),
})

const autoRigRequest = z.object({
  id: z.string().min(1),
  backendId: z.string().min(1),
  positions: z.instanceof(Float32Array).refine(values => values.length >= 9),
  triangles: z.instanceof(Uint32Array).refine(values => values.length >= 3),
  primitives: z.array(primitive).min(1),
  options,
})

type ParsedAutoRigRequest = z.infer<typeof autoRigRequest>

function validateMesh(
  request: ParsedAutoRigRequest,
  context: z.RefinementCtx,
  maximumBytes: number,
): void {
  const vertices = request.positions.length / 3
  if (request.positions.length % 3 !== 0 || request.triangles.length % 3 !== 0) {
    context.addIssue({ code: 'custom', message: 'invalid component count' })
    return
  }
  if (request.positions.byteLength + request.triangles.byteLength > maximumBytes)
    context.addIssue({ code: 'custom', message: 'mesh budget exceeded' })
  if (request.positions.some(value => !Number.isFinite(value)))
    context.addIssue({ code: 'custom', message: 'non-finite position' })
  if (request.triangles.some(index => index >= vertices))
    context.addIssue({ code: 'custom', message: 'triangle index outside mesh' })
  if (request.primitives.length > vertices)
    context.addIssue({ code: 'custom', message: 'primitive budget exceeded' })
}

function validatePartitions(request: ParsedAutoRigRequest, context: z.RefinementCtx): void {
  const targets = new Set<string>()
  let offset = 0
  for (const target of [...request.primitives].sort(
    (one, other) => one.vertexOffset - other.vertexOffset,
  )) {
    const key = `${target.mesh}:${target.primitive}`
    if (targets.has(key) || target.vertexOffset !== offset) {
      context.addIssue({ code: 'custom', message: 'invalid primitive partition' })
      return
    }
    targets.add(key)
    offset += target.vertexCount
  }
  if (offset !== request.positions.length / 3)
    context.addIssue({ code: 'custom', message: 'incomplete primitive partition' })
}

const requestSchema = (maximumBytes: number) =>
  autoRigRequest.superRefine((request, context) => {
    validateMesh(request, context, maximumBytes)
    validatePartitions(request, context)
  })

export function parseAutoRigRequest(
  value: unknown,
  maximumBytes: number = MAX_MESH_BYTES,
): AutoRigInferenceRequest {
  return requestSchema(maximumBytes).parse(value)
}

export function registerAutoRigHandlers(autoRig: AutoRigHost, running: RunningTasks): void {
  handle(CHANNELS.autoRigRun, async (_event, untrusted) => {
    const request = parseAutoRigRequest(untrusted)
    return running.run(request.id, signal =>
      autoRig.run(request, signal, (ratio, phase) =>
        broadcast(EVENTS.taskProgress, { id: request.id, ratio, phase }),
      ),
    )
  })
}
