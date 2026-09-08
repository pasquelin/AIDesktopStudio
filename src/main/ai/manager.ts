import type { AiOverview, InstallRefusal, LoadRefusal } from '@shared/domain/aiOverview'
import type { AiRoleId } from '@shared/domain/aiRole'
import type { RuntimeEndpointId } from '@shared/domain/aiRuntime'
import {
  isSuppliedModel,
  modelRefusalOf,
  type DownloadProgress,
  type LocalModel,
  type ModelLoader,
} from '@shared/domain/localModel'
import type { Settings } from '@shared/domain/settings'
import { orElse } from '@shared/promises'
import { admissionFor } from './admission'
import { assertProvidersAdmitted, chooseProviders } from './managerChoices'
import { catalogueWith, modelsForWith, modelWith, rolesServedBy } from './catalogue'
import { asRuntimeSnapshot, type HardwareFacts } from './hardwareProbe'
import {
  discoveredOf,
  endpointOf,
  endpointsOf,
  runtimeReadingsOf,
  type RuntimeReading,
} from './localRuntimes'
import { aiOverviewOf, effectiveChoices, rowFor, type OverviewInput } from './overview'
import type { AiManager, HeldRuntime, LoadingModel, ManagerDeps } from './managerTypes'
import * as managerHelpers from './managerHelpers'
import { createRuntimeInstaller, type RuntimeInstaller } from './managerRuntimeInstaller'
import { DownloadCancelled } from './modelInstall'
export type { AiManager, ManagerDeps } from './managerTypes'
export function createAiManager(deps: ManagerDeps): AiManager {
  let running: managerHelpers.RunningInstall | null = null
  let loading: LoadingModel | null = null
  let loadFailure: LoadRefusal | null = null
  let installFailure: InstallRefusal | null = null
  const occupancy = new Map<RuntimeEndpointId, HeldRuntime>()
  const lastUsedAt = new Map<RuntimeEndpointId, number>()
  const working = new Map<RuntimeEndpointId, number>()
  let disposed = false
  const schedule = managerHelpers.scheduleWith(deps)
  let cancelIdle: (() => void) | null = null
  const ttl = deps.factsTtlMs ?? managerHelpers.DEFAULT_FACTS_TTL_MS
  let lastDiscovered: readonly LocalModel[] = []
  let cachedDiscovered: { at: number; models: Promise<readonly LocalModel[]> } | null = null
  function forgetDiscovered(): void {
    cachedDiscovered = null
  }
  async function readDiscovered(): Promise<readonly LocalModel[]> {
    try {
      const models = await discoveredOf(deps.runtimes)
      lastDiscovered = models
      return models
    } catch (error) {
      forgetDiscovered()
      throw error
    }
  }
  const discover = (): Promise<readonly LocalModel[]> => {
    if (cachedDiscovered !== null && deps.now() - cachedDiscovered.at < ttl) {
      return cachedDiscovered.models
    }
    const reading = readDiscovered()
    cachedDiscovered = { at: deps.now(), models: reading }
    return reading
  }
  const modelOf = (modelId: string): LocalModel | null =>
    modelWith(modelId, deps.settings().ai.ownModels, lastDiscovered)
  const loadedEpochs = managerHelpers.createLoadEpochs(modelOf, occupancy)
  let cachedFacts: { at: number; facts: Promise<HardwareFacts> } | null = null
  async function readFacts(): Promise<HardwareFacts> {
    try {
      return await deps.facts()
    } catch (error) {
      cachedFacts = null
      throw error
    }
  }
  const facts = (): Promise<HardwareFacts> => {
    if (cachedFacts !== null && deps.now() - cachedFacts.at < ttl) return cachedFacts.facts
    const reading = readFacts()
    cachedFacts = { at: deps.now(), facts: reading }
    return reading
  }
  const freshFacts = (): Promise<HardwareFacts> => {
    cachedFacts = null
    return facts()
  }
  const readingsOf = async (
    models: readonly LocalModel[],
  ): Promise<ReadonlyMap<ModelLoader, RuntimeReading>> =>
    await runtimeReadingsOf(deps.runtimes, models, (loader, why) =>
      deps.log('info', `${loader} is not answering: ${why}`),
    )
  let onDisk: ReadonlySet<string> = new Set()
  const reconcile = (readings: ReadonlyMap<ModelLoader, RuntimeReading>): void => {
    onDisk = new Set([...readings.values()].flatMap(reading => [...reading.installed]))
    for (const [loader, reading] of readings) {
      for (const endpoint of endpointsOf(loader)) {
        const held = occupancy.get(endpoint)
        if (held && !reading.loaded.has(held.modelId)) occupancy.delete(endpoint)
      }
    }
  }
  const inputFrom = (
    machine: HardwareFacts,
    readings: ReadonlyMap<ModelLoader, RuntimeReading>,
    stored: Settings,
    models: (role: AiRoleId) => readonly LocalModel[],
  ): OverviewInput => {
    return {
      facts: machine,
      snapshot: deps.snapshotOf(machine, Object.fromEntries(occupancy)),
      choices: stored.ai.roles,
      projectChoices: stored.ai.projectRoles,
      projectPath: deps.currentProjectPath(),
      modelsFor: models,
      isInstalled: model => readings.get(model.loader)?.installed.has(model.id) === true,
      isLoaded: model => readings.get(model.loader)?.loaded.has(model.id) === true,
      isHoldable: model => deps.runtimes[model.loader]?.load !== undefined,
      runtimeReady: model => readings.get(model.loader)?.ready === true,
      rolesServedBy,
      readyClouds: deps.readyClouds(),
      installing:
        running === null ? null : { modelId: running.modelId, progress: running.progress },
      loading: loading === null ? null : { modelId: loading.modelId, ratio: loading.ratio },
      loadFailure,
      installFailure,
      ollamaNames: [],
      ...runtimeInstaller.view(readings),
    }
  }
  async function compose(): Promise<AiOverview> {
    const stored = deps.settings()
    const own = stored.ai.ownModels
    const [machine, discovered] = await Promise.all([facts(), discover()])
    const readings = await readingsOf(catalogueWith(own, discovered))
    reconcile(readings)
    const ollamaNames = discovered
      .filter(model => model.loader === 'ollama')
      .map(model => model.name)
    return aiOverviewOf({
      ...inputFrom(machine, readings, stored, role => modelsForWith(role, own, discovered)),
      ollamaNames,
    })
  }
  let published: AiOverview | null = null
  async function announce(): Promise<AiOverview> {
    published = await compose()
    deps.emit(published)
    return published
  }
  function republish(patch: Partial<AiOverview>): void {
    if (published === null) {
      void announce()
      return
    }
    published = { ...published, ...patch }
    deps.emit(published)
  }
  const runtimeInstaller: RuntimeInstaller = createRuntimeInstaller(deps, {
    announce,
    compose,
    current: () => published,
    republish,
    forgetDiscovered,
    modelInstallRunning: () => running !== null,
  })
  async function fetchFiles(model: LocalModel, abort: AbortController): Promise<void> {
    try {
      const runtime = deps.runtimes[model.loader]
      if (!runtime) throw new Error(`no runtime for ${model.loader}`)
      await runtime.install(
        model,
        progress => {
          if (running === null) return
          running.progress = progress
          for (const watcher of running.watchers) watcher(progress)
          republish({ installing: { modelId: running.modelId, progress } })
        },
        abort.signal,
      )
      installFailure = null
    } catch (error) {
      if (!(error instanceof DownloadCancelled)) {
        installFailure = managerHelpers.installRefusalOf(error, model.id)
      }
      throw error
    } finally {
      running = null
      try {
        await announce()
      } catch (error) {
        deps.log('warn', `manager state unpublished: ${String(error)}`)
      }
    }
  }
  function start(model: LocalModel): managerHelpers.RunningInstall {
    installFailure = null
    const abort = new AbortController()
    const entry: managerHelpers.RunningInstall = {
      modelId: model.id,
      progress: { received: 0, total: 0 },
      abort,
      watchers: [],
      done: managerHelpers.afterTurn(() => fetchFiles(model, abort)),
    }
    running = entry
    void announce()
    return entry
  }
  function installModel(
    model: LocalModel,
    onProgress: (progress: DownloadProgress) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (modelRefusalOf(model) !== null) return Promise.reject(new Error('model is not admitted'))
    if (runtimeInstaller.isInstallingOllama()) {
      return Promise.reject(new Error('busy with ollama'))
    }
    if (running !== null && (running.modelId !== model.id || running.abort.signal.aborted)) {
      return Promise.reject(new Error(`busy with ${running.modelId}`))
    }
    const entry = running ?? start(model)
    entry.watchers.push(onProgress)
    signal?.addEventListener('abort', () => entry.abort.abort(), { once: true })
    return entry.done
  }
  const release = async (endpoint: RuntimeEndpointId, andClose = false): Promise<void> => {
    const idle = (): boolean => !disposed && (working.get(endpoint) ?? 0) === 0
    if (!idle()) return
    const runtime = deps.runtimes[managerHelpers.loaderOf(endpoint)]
    try {
      // Killing the door returns its tensors AND the 208 MB an unload never gave back (ADR-18).
      if (andClose && runtime?.close) await runtime.close(endpoint)
      else await runtime?.unload?.(endpoint)
    } finally {
      if (idle()) occupancy.delete(endpoint)
    }
  }
  const armIdle = (): void => {
    cancelIdle?.()
    cancelIdle = null
    if (disposed) return
    const minutes = deps.idleUnloadMinutes?.() ?? managerHelpers.DEFAULT_IDLE_UNLOAD_MINUTES
    if (minutes <= 0 || occupancy.size === 0) return
    cancelIdle = schedule(() => {
      if (disposed || loading !== null) {
        if (!disposed) armIdle()
        return
      }
      void (async () => {
        for (const endpoint of [...occupancy.keys()]) {
          if (disposed || loading !== null) break
          if ((working.get(endpoint) ?? 0) > 0) continue
          try {
            await release(endpoint, true)
          } catch (error) {
            deps.log('warn', `idle unload of ${endpoint} failed: ${String(error)}`)
          }
        }
        if (!disposed && occupancy.size > 0) armIdle()
        if (!disposed) await announce()
      })()
    }, minutes * 60000)
  }
  const markUsed = (modelId: string): void => {
    const model = modelOf(modelId)
    if (!model) return
    const endpoint = endpointOf(model.loader, model.modality)
    if (!occupancy.has(endpoint)) return
    lastUsedAt.set(endpoint, deps.now())
    armIdle()
  }
  const hold = (modelId: string): (() => void) => {
    const model = modelOf(modelId)
    if (!model || disposed) return () => {}
    const endpoint = endpointOf(model.loader, model.modality)
    markUsed(modelId)
    working.set(endpoint, (working.get(endpoint) ?? 0) + 1)
    return () => {
      const left = (working.get(endpoint) ?? 1) - 1
      if (left <= 0) working.delete(endpoint)
      else working.set(endpoint, left)
      if (!disposed && working.size === 0) armIdle()
    }
  }
  const admit = async (model: LocalModel): Promise<LoadRefusal | null> => {
    const snapshot = asRuntimeSnapshot(
      deps.snapshotOf(await freshFacts(), Object.fromEntries(occupancy)),
    )
    if (snapshot === null) return null
    const active = new Set(working.keys())
    if (loading) {
      const held = modelOf(loading.modelId)
      if (held) active.add(endpointOf(held.loader, held.modality))
    }
    const admission = admissionFor(
      snapshot,
      { endpoint: endpointOf(model.loader, model.modality), needBytes: model.reservationBytes },
      { active, lastUsedAt },
    )
    if (admission.verdict === 'release-first') {
      for (const door of admission.release) {
        await release(door)
      }
    }
    if (admission.verdict !== 'refuse') return null
    return admission.reason === 'beyond-machine'
      ? {
          reason: 'beyond-machine',
          modelId: model.id,
          neededBytes: model.reservationBytes,
          availableBytes: snapshot.availableBytes,
        }
      : { reason: 'failed', modelId: model.id }
  }
  let loadFlight: Promise<void> | null = null
  async function trackLoad(work: Promise<void>): Promise<void> {
    try {
      await work
    } finally {
      loadFlight = null
    }
  }
  const runLoad = async (model: LocalModel): Promise<void> => {
    if (modelRefusalOf(model) !== null) throw new Error('model is not admitted')
    if (loading?.modelId === model.id && loadFlight) return loadFlight
    if (loading !== null) throw new Error(`busy loading ${loading.modelId}`)
    const work = (async () => {
      const load = deps.runtimes[model.loader]?.load
      const endpoint = endpointOf(model.loader, model.modality)
      const abort = new AbortController()
      loading = { modelId: model.id, ratio: 0, abort }
      loadFailure = null
      await announce()
      try {
        loadFailure = await admit(model)
        if (loadFailure !== null) return
        if (!load) throw new Error(`nothing here holds ${model.id} in memory`)
        const onDiskNow = await readingsOf([model])
        if (onDiskNow.get(model.loader)?.installed.has(model.id) !== true) {
          loadFailure = { reason: 'incomplete', modelId: model.id }
          deps.log(
            'warn',
            `refusing to load ${model.id}: files missing or the wrong size — reinstall`,
          )
          return
        }
        const bytes = await load(model, {
          onProgress: ratio => {
            if (loading === null || ratio - loading.ratio < managerHelpers.LOAD_STEP) return
            loading.ratio = ratio
            republish({ loading: { modelId: loading.modelId, ratio } })
          },
          signal: abort.signal,
        })
        occupancy.set(endpoint, { bytes, reclaimable: true, modelId: model.id })
        loadedEpochs.note(endpoint)
        lastUsedAt.set(endpoint, deps.now())
        armIdle()
      } catch (error) {
        loadFailure = managerHelpers.loadRefusalOf(error, model.id)
        deps.log('warn', `loading ${model.id} failed: ${String(error)}`)
      } finally {
        loading = null
      }
    })()
    loadFlight = trackLoad(work)
    await loadFlight
  }
  const chooseMany: AiManager['chooseMany'] = async (writes, scope) => {
    assertProvidersAdmitted(writes, modelOf)
    return await chooseProviders(deps, announce, compose, writes, scope)
  }
  return {
    overview: compose,
    installedIds: () => onDisk,
    refresh: async () => {
      await announce()
    },
    lookup: modelId => modelOf(modelId),
    discovered: () => lastDiscovered,
    forgetDiscovered,
    providerOf: async role => {
      const stored = deps.settings()
      const discovered = await discover()
      const models = modelsForWith(role, stored.ai.ownModels, discovered)
      const [machine, readings] = await Promise.all([facts(), readingsOf(models)])
      const input = inputFrom(machine, readings, stored, () => models)
      return rowFor(role, input, effectiveChoices(input)).provider
    },
    unservedRoles: async roles => {
      const stored = deps.settings()
      const own = stored.ai.ownModels
      const [discovered, machine] = await Promise.all([discover(), facts()])
      const forRole = (role: AiRoleId): readonly LocalModel[] =>
        modelsForWith(role, own, discovered)
      const union = new Map(roles.flatMap(forRole).map(model => [model.id, model]))
      const input = inputFrom(machine, await readingsOf([...union.values()]), stored, forRole)
      const choices = effectiveChoices(input)
      return roles.filter(role => rowFor(role, input, choices).provider === null)
    },
    choose: (role, provider, scope) => chooseMany([{ role, provider }], scope),
    chooseMany,
    installModel,
    installOllama: runtimeInstaller.installOllama,
    cancelInstallOllama: runtimeInstaller.cancelOllama,
    readEngine: runtimeInstaller.readEngine,
    installEngine: runtimeInstaller.installEngine,
    cancelInstallEngine: runtimeInstaller.cancelEngine,
    install: async modelId => {
      const model = modelOf(modelId)
      if (model === null || isSuppliedModel(model)) return compose()
      try {
        await installModel(model, () => {})
        forgetDiscovered()
      } catch (error) {
        deps.log('warn', `install of ${modelId} stopped: ${String(error)}`)
      }
      return published ?? compose()
    },
    cancelInstall: async () => {
      running?.abort.abort()
      return published ?? compose()
    },
    remove: async modelId => {
      const model = modelOf(modelId)
      if (model === null) return compose()
      const endpoint = endpointOf(model.loader, model.modality)
      if ((working.get(endpoint) ?? 0) > 0) return compose()
      if (isSuppliedModel(model)) {
        // `orElse`: closing is a round trip that can time out, and the delete asked for must not
        // be undone by a door that would not answer.
        const resident = occupancy.get(endpoint)?.modelId === modelId
        if (resident) await orElse(release(endpoint, true), undefined)
        const stored = deps.settings()
        await deps.writeSettings({
          ai: { ...stored.ai, ownModels: stored.ai.ownModels.filter(one => one.id !== modelId) },
        })
        return announce()
      }
      try {
        await deps.runtimes[model.loader]?.remove(model)
        forgetDiscovered()
      } catch (error) {
        deps.log('warn', `removing ${modelId} failed: ${String(error)}`)
      }
      return announce()
    },
    load: async modelId => {
      const model = modelOf(modelId)
      if (model === null) return compose()
      if (loading !== null && loading.modelId !== modelId) return compose()
      await runLoad(model)
      return announce()
    },
    ensureLoaded: async modelId => {
      const model = modelOf(modelId)
      if (model === null) throw new Error(`${modelId} is not in the catalogue`)
      if (await managerHelpers.modelIsStillHeld(model, occupancy, readingsOf)) return
      while (loadFlight && loading?.modelId !== modelId) await orElse(loadFlight, undefined)
      if (disposed) throw new Error(`${modelId} was asked for after the manager was disposed`)
      await runLoad(model)
      await announce()
      if (loadFailure !== null) throw managerHelpers.loadThrowOf(loadFailure)
    },
    loadedEpoch: loadedEpochs.read,
    cancelLoad: async () => {
      loading?.abort.abort()
      return published ?? compose()
    },
    noteUse: markUsed,
    hold,
    dispose: () => {
      disposed = true
      cancelIdle?.()
      cancelIdle = null
    },
    unload: async modelId => {
      const model = modelOf(modelId)
      if (model === null) return compose()
      try {
        await release(endpointOf(model.loader, model.modality), true)
      } catch (error) {
        deps.log('warn', `unloading ${modelId} failed: ${String(error)}`)
      }
      if (occupancy.size === 0) {
        cancelIdle?.()
        cancelIdle = null
      }
      return announce()
    },
    addOwnModel: async model => {
      const stored = deps.settings()
      const kept = stored.ai.ownModels.filter(one => one.id !== model.id)
      await deps.writeSettings({ ai: { ...stored.ai, ownModels: [...kept, model] } })
      return announce()
    },
  }
}
