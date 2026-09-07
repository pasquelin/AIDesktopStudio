import type { InstallRefusal, LoadRefusal } from '@shared/domain/aiOverview'
import { ENGINE_FAILURES } from '@shared/domain/failure'
import { codeIn } from '@shared/guards'
import type { AiRoleId, RoleChoices, RoleProvider } from '@shared/domain/aiRole'
import type { RuntimeEndpointId } from '@shared/domain/aiRuntime'
import {
  MODEL_LOADERS,
  type DownloadProgress,
  type LocalModel,
  type ModelLoader,
} from '@shared/domain/localModel'
import { endpointOf, endpointsOf, type RuntimeReading } from './localRuntimes'
import { ChecksumMismatch, NetworkInterrupted, isNetworkError } from './modelInstall'
import type { HeldRuntime, ManagerDeps } from './managerTypes'

export type RunningInstall = {
  modelId: string
  progress: DownloadProgress
  abort: AbortController
  watchers: ((progress: DownloadProgress) => void)[]
  done: Promise<void>
}

export const DEFAULT_FACTS_TTL_MS = 3000
export const DEFAULT_IDLE_UNLOAD_MINUTES = 10
export const LOAD_STEP = 0.01

export async function afterTurn(run: () => Promise<void>): Promise<void> {
  await Promise.resolve()
  await run()
}

export function createLoadEpochs(
  modelOf: (modelId: string) => LocalModel | null,
  occupancy: ReadonlyMap<RuntimeEndpointId, HeldRuntime>,
): { note: (endpoint: RuntimeEndpointId) => void; read: (modelId: string) => number | null } {
  const values = new Map<RuntimeEndpointId, number>()
  return {
    note: endpoint => values.set(endpoint, (values.get(endpoint) ?? 0) + 1),
    read: modelId => {
      const model = modelOf(modelId)
      if (!model) return null
      const endpoint = endpointOf(model.loader, model.modality)
      return occupancy.get(endpoint)?.modelId === modelId ? (values.get(endpoint) ?? null) : null
    },
  }
}

export async function modelIsStillHeld(
  model: LocalModel,
  occupancy: Map<RuntimeEndpointId, HeldRuntime>,
  readingsOf: (models: readonly LocalModel[]) => Promise<ReadonlyMap<ModelLoader, RuntimeReading>>,
): Promise<boolean> {
  const endpoint = endpointOf(model.loader, model.modality)
  if (occupancy.get(endpoint)?.modelId !== model.id) return false
  if ((await readingsOf([model])).get(model.loader)?.loaded.has(model.id)) return true
  occupancy.delete(endpoint)
  return false
}

export function scheduleWith(
  deps: Pick<ManagerDeps, 'schedule'>,
): NonNullable<ManagerDeps['schedule']> {
  return (
    deps.schedule ??
    ((run, ms) => {
      const timer = setTimeout(run, ms)
      timer.unref?.()
      return () => clearTimeout(timer)
    })
  )
}

const LOADER_BY_ENDPOINT: ReadonlyMap<RuntimeEndpointId, ModelLoader> = new Map(
  MODEL_LOADERS.flatMap(loader =>
    endpointsOf(loader).map((door): [RuntimeEndpointId, ModelLoader] => [door, loader]),
  ),
)

export function loaderOf(endpoint: RuntimeEndpointId): ModelLoader {
  const loader = LOADER_BY_ENDPOINT.get(endpoint)
  if (!loader) throw new Error(`no loader answers on ${endpoint}`)
  return loader
}

export function withWrites(
  choices: RoleChoices,
  writes: readonly { role: AiRoleId; provider: RoleProvider | null }[],
): RoleChoices {
  let next = choices
  for (const write of writes) {
    const withoutRole = Object.fromEntries(
      Object.entries(next).filter(([key]) => key !== write.role),
    )
    next = write.provider === null ? withoutRole : { ...next, [write.role]: write.provider }
  }
  return next
}

export function installRefusalOf(error: unknown, modelId: string): InstallRefusal {
  if (error instanceof ChecksumMismatch) return { reason: 'checksum', modelId }
  return error instanceof NetworkInterrupted || isNetworkError(error)
    ? { reason: 'network', modelId }
    : { reason: 'failed', modelId }
}

export function loadRefusalOf(error: unknown, modelId: string): LoadRefusal {
  if (error instanceof NetworkInterrupted || isNetworkError(error))
    return { reason: 'network', modelId }
  const text = String(error)
  const engine = codeIn(text, ENGINE_FAILURES)
  if (engine) return { reason: engine, modelId }
  return text.includes('no file named') || text.includes('incomplete-model')
    ? { reason: 'incomplete', modelId }
    : { reason: 'failed', modelId }
}

export function loadThrowOf(failure: LoadRefusal): Error {
  if (failure.reason === 'beyond-machine')
    return new Error(
      `${failure.modelId} needs ${failure.neededBytes} bytes, ${failure.availableBytes} free`,
    )
  if (failure.reason === 'incomplete') return new Error('incomplete-model')
  if (failure.reason === 'network') return new Error('network')
  const engine = codeIn(failure.reason, ENGINE_FAILURES)
  if (engine) return new Error(engine)
  return new Error(`loading ${failure.modelId} failed`)
}
