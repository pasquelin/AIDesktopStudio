import { localizedError } from '@shared/localizedError'
import {
  autoRigResultFaultOf,
  type AutoRigBackendDescriptor,
  type AutoRigBackendId,
  type AutoRigPrimitiveTarget,
  type AutoRigResult,
} from '@shared/domain/autoRig'

export type AutoRigRunContext = {
  signal: AbortSignal
  onProgress: (progress: number) => void
  targets: readonly AutoRigPrimitiveTarget[]
}

export type AutoRigBackend<Input> = AutoRigBackendDescriptor & {
  run: (input: Input, context: AutoRigRunContext) => Promise<AutoRigResult>
}

export class AutoRigService<Input> {
  private readonly backends = new Map<string, AutoRigBackend<Input>>()

  constructor(backends: readonly AutoRigBackend<Input>[]) {
    for (const backend of backends) {
      if (this.backends.has(backend.id))
        throw localizedError('autoRigBackendDuplicate', { name: backend.id })
      this.backends.set(backend.id, backend)
    }
  }

  available(): AutoRigBackendDescriptor[] {
    return [...this.backends.values()].map(
      ({ id, requiresModel, modelIds, devices, experimental, capabilities, platformSupport }) => ({
        id,
        requiresModel,
        modelIds,
        devices,
        experimental,
        capabilities,
        platformSupport,
      }),
    )
  }

  async run(
    backendId: AutoRigBackendId,
    input: Input,
    context: AutoRigRunContext,
  ): Promise<AutoRigResult> {
    const backend = this.backends.get(backendId)
    if (!backend) throw localizedError('autoRigBackendUnknown', { name: backendId })
    if (context.signal.aborted) throw new Error('CANCELLED')
    const result = await backend.run(input, context)
    if (context.signal.aborted) throw new Error('CANCELLED')
    const fault = autoRigResultFaultOf(result, context.targets)
    if (fault) throw localizedError('autoRigResultInvalid', { reason: fault })
    return { ...result, metadata: { ...result.metadata, backendId } }
  }
}
