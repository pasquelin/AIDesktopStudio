import type { EngineFailure } from '@shared/domain/failure'
import type { AiOverview, OwnModelProfile } from '@shared/domain/aiOverview'
import { chatModelOf, CLOUD_PROVIDERS, type HttpChat } from '@shared/domain/aiCloud'
import { STT_MODEL } from '@shared/domain/dictation'
import type { LocalModel } from '@shared/domain/localModel'
import { needsOwnFolder } from '@shared/domain/localModel'
import type { WorkspaceId } from '@shared/domain/workspace'
import { app, systemPreferences } from 'electron'
import { spawn } from 'node:child_process'
import { chmod, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { totalmem } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleepFor } from 'node:timers/promises'
import { createAiManager, type AiManager } from './ai/manager'
import { catalogueWith, modelWith } from './ai/catalogue'
import { electronHardwarePort } from './ai/electronHardwarePort'
import { electronLlamaPort } from './ai/electronLlamaPort'
import { llamaLocalRuntime } from './ai/llamaRuntime'
import { ensureOllama, ollamaInstalled } from './ai/ensureOllama'
import { installEngineLibraries } from './ai/installEngineLibraries'
import { spawnLines } from './ai/spawnLines'
import {
  extractOllamaArchive,
  fetchOllamaArchive,
  installOllama,
  needsZstd,
  zstdOnPath,
} from './ai/installOllama'
import { ollamaHttpPort, ollamaLocalRuntime } from './ai/ollamaRuntime'
import { hardwareProbe, memorySnapshotOf } from './ai/hardwareProbe'
import { readyCloudsOf } from './ai/cloudReadiness'
import { createPythonClient } from './ai/pythonClient'
import { openPythonProcess } from './ai/pythonProcess'
import { notAnswering, pythonRuntime } from './ai/pythonRuntime'
import { createPythonSupervisor, EngineMissingError } from './ai/pythonSupervisor'
import { createAutoRigHost } from './ai/autoRigHost'
import { createSmartSelectionHost } from './ai/smartSelectionHost'
import { readBitmap } from './media/readBitmap'
import { fileRuntime, type LocalRuntimes } from './ai/localRuntimes'
import { createOwnModelAdder } from './ai/ownModelAdder'
import { fetchModel, modelIsComplete } from './ai/modelInstall'
import {
  createDownloadHost,
  defaultModelFolder,
  ensureFolder,
  migrateSttFolder,
} from './ai/modelStore'
import { spacesWithNoModel, SPACE_ROLES } from './ai/spacesWithNoModel'
import { openSttProcess } from './dictation/sttProcess'
import { createSession, type DictationSession } from './dictation/session'
import { requestMicrophone } from './dictation/permissions'
import { bundledEngine, bundledVad, resourcesRoot } from './resources'
import { createEmbedder, EMBEDDER_IDLE_MS } from './memory/embedder'
import { embedModelId, embedWeightsOf, type EmbedChoiceDeps } from './memory/embedChoice'
import { openEmbedProcess } from './memory/embedProcess'
import type { MemoryHost } from './memory/memoryHost'
import { createMemoryVectors } from './memory/memoryVectors'
import type { ProjectStore } from './project/store'
import type { SettingsStore } from './settings/store'
import type { AssistantBrain } from './assistant/brainPort'
import { createHttpChatBrain } from './assistant/brainHttp'
import { activeProvidersOf } from '@shared/domain/account'
import { broadcast } from './ipc/broadcast'
import { EVENTS } from '@shared/ipc'
import { log } from './log'
import type { Language } from '@shared/i18n'

const BUDGET = {
  appBudgetBytes: Math.round((totalmem() * 3) / 4),
  headroomBytes: 2_000_000_000,
  rendererReservedBytes: 475_000_000,
}
const OLLAMA_LOOK_MS = 10_000

const enginePython = (): string => bundledEngine(resourcesRoot(), process.platform).python

export type FromManager = {
  installedIds: () => ReadonlySet<string>
  discovered: () => readonly LocalModel[]
  engineFailure: () => EngineFailure | null
}

type LocalAiDeps = {
  settings: SettingsStore
  project: ProjectStore
  memory: MemoryHost
  fromManager: FromManager
  language: () => Language
  pickWeights: (language: Language, profile?: OwnModelProfile) => Promise<string | null>
  providerBrain: () => AssistantBrain
  schedule: (run: () => void, delayMs: number) => () => void
}

export function createLocalAiServices(deps: LocalAiDeps) {
  const modelFolder = (): string =>
    deps.settings.read().dictation.modelFolder ?? defaultModelFolder(app.getPath('userData'))
  void migratePreviousModelFolder(modelFolder())
  const downloads = createDownloadHost()
  const folderFor = (model: LocalModel): string =>
    model.weightsPath ??
    (needsOwnFolder(model.loader) ? join(modelFolder(), model.id) : modelFolder())
  const fetchedFiles = createFileRuntime(folderFor, downloads)
  const llama = electronLlamaPort()
  let hold =
    (_modelId: string): (() => void) =>
    () => {}
  let ensureLoaded = (_modelId: string): Promise<void> => Promise.resolve()
  const weightsOf = (model: LocalModel): string =>
    model.weightsPath ?? join(modelFolder(), model.files[0]?.name ?? '')
  let lookup = (modelId: string): LocalModel | null =>
    modelWith(modelId, deps.settings.read().ai.ownModels)
  const modelOf = (modelId: string): LocalModel | null => lookup(modelId)
  const isLocalTarget = (targetId: string): boolean => modelOf(targetId) !== null
  const engine = createEngine(folderFor, downloads, modelOf, modelId => hold(modelId))
  const ollama = createOllama()
  let forgetDiscovered = (): void => {}
  let refreshOverview = (): Promise<void> => Promise.resolve()
  const runtimes = createRuntimes({
    fetchedFiles,
    engine,
    llama,
    weightsOf,
    modelOf,
    hold: id => hold(id),
    ensureLoaded: id => ensureLoaded(id),
    ollama,
    stale: () => {
      forgetDiscovered()
      void refreshAfterStale(refreshOverview)
    },
  })
  let dictation: DictationSession | null = null
  const notReady = async (): Promise<readonly WorkspaceId[]> =>
    spacesWithNoModel(await ai.unservedRoles(SPACE_ROLES))
  const clouds = createClouds(deps, notReady)
  const ai = createManager(deps, modelFolder, llama, runtimes, ollama, engine, overview => {
    broadcast(EVENTS.ai, overview)
    void dictation?.probeModel()
  })
  hold = ai.hold
  ensureLoaded = ai.ensureLoaded
  lookup = modelId => ai.lookup(modelId)
  forgetDiscovered = () => ai.forgetDiscovered()
  refreshOverview = () => ai.refresh()
  Object.assign(deps.fromManager, {
    installedIds: () => ai.installedIds(),
    discovered: () => ai.discovered(),
    engineFailure: () =>
      existsSync(enginePython()) ? engine.supervisor.whyNot() : 'engine-missing',
  } satisfies FromManager)
  const { memoryVectors, embedder } = createVectors(deps, ai, modelOf, weightsOf)
  const { autoRig, smartSelection } = localHosts(deps, ai, engine, ensureLoaded, hold)
  const addOwnAiModel = createOwnModelAdder(deps, ai)
  dictation = createDictation(deps, ai, modelFolder, downloads)
  return {
    modelFolder,
    downloads,
    clouds,
    runtimes,
    ai,
    engine,
    llama,
    weightsOf,
    modelOf,
    isLocalTarget,
    notReady,
    memoryVectors,
    embedder,
    addOwnAiModel,
    dictation,
    autoRig,
    smartSelection,
  }
}

function localHosts(
  deps: LocalAiDeps,
  ai: AiManager,
  engine: ReturnType<typeof createEngine>,
  ensureLoaded: (modelId: string) => Promise<void>,
  hold: (modelId: string) => () => void,
) {
  return {
    autoRig: createAutoRigHost({
      models: () => catalogueWith(deps.settings.read().ai.ownModels, ai.discovered()),
      installedIds: ai.installedIds,
      ensureLoaded: ai.ensureLoaded,
      hold: ai.hold,
      engine: () => engine.supervisor.engine(),
    }),
    smartSelection: createSmartSelectionHost({
      ensureLoaded,
      hold,
      engine: () => engine.supervisor.engine(),
      epoch: () => ai.loadedEpoch?.('efficient-sam-ti') ?? null,
      readBitmap,
    }),
  }
}

async function migratePreviousModelFolder(folder: string): Promise<void> {
  try {
    await migrateSttFolder(folder)
  } catch (error) {
    log.warn('ai', `moving the previous model folder failed: ${String(error)}`)
  }
}

async function refreshAfterStale(refresh: () => Promise<void>): Promise<void> {
  try {
    await refresh()
  } catch (error) {
    log.warn('ai', `overview unpublished after a stale local model: ${String(error)}`)
  }
}

function createFileRuntime(
  folderFor: (model: LocalModel) => string,
  downloads: ReturnType<typeof createDownloadHost>,
) {
  return fileRuntime({
    folderFor,
    isComplete: (model, folder) => modelIsComplete(downloads, model, folder),
    fetch: async (model, folder, onProgress, signal) => {
      await ensureFolder(folder)
      await fetchModel(downloads, model, { folder, onProgress, signal })
    },
    removeFiles: async (model, folder) => {
      if (needsOwnFolder(model.loader)) return await rm(folder, { recursive: true, force: true })
      for (const file of model.files) await rm(join(folder, file.name), { force: true })
    },
  })
}

function createEngine(
  folderFor: (model: LocalModel) => string,
  downloads: ReturnType<typeof createDownloadHost>,
  modelOf: (id: string) => LocalModel | null,
  onUsed: (id: string) => () => void,
) {
  const engine = createPythonSupervisor({
    open: listeners => {
      const bundled = bundledEngine(resourcesRoot(), process.platform)
      if (!existsSync(bundled.python)) throw new EngineMissingError(bundled.python)
      return createPythonClient(
        openPythonProcess({
          command: bundled.python,
          args: ['-m', 'aidesktopstudio_engine.core.supervisor'],
          sources: bundled.sources,
          processName: 'the local AI engine',
        }),
        listeners,
      )
    },
    now: Date.now,
    delay: ms => sleepFor(ms),
  })
  const runtime = pythonRuntime({
    folderFor,
    isComplete: (model, folder) => modelIsComplete(downloads, model, folder),
    fetch: async (model, folder, onProgress, signal) => {
      await ensureFolder(folder)
      await fetchModel(downloads, model, { folder, onProgress, signal })
    },
    removeFiles: (_model, folder) => rm(folder, { recursive: true, force: true }),
    baseOf: model => (model.attaches ? modelOf(model.attaches.model) : null),
    engine: () => engine.engine(),
    running: () => engine.current(),
    whyNot: () => engine.whyNot(),
    log: (level, message) => log[level]('ai', message),
    onUsed,
  })
  return { supervisor: engine, runtime }
}

function createOllama() {
  const port = ollamaHttpPort()
  const directory = join(app.getPath('userData'), 'ollama')
  let remembered: { at: number; yes: boolean } | null = null
  // Cached for ten seconds: absence checks one candidate per PATH entry (46 measured locally).
  const installed = (): boolean => {
    if (remembered && Date.now() - remembered.at < OLLAMA_LOOK_MS) return remembered.yes
    remembered = {
      at: Date.now(),
      yes: ollamaInstalled(process.platform, process.env, existsSync, directory),
    }
    return remembered.yes
  }
  const ensure = ensureOllama({
    platform: process.platform,
    env: process.env,
    extraDir: directory,
    exists: existsSync,
    spawn: (command, args) => {
      const child = spawn(command, [...args], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      })
      child.unref()
      child.on('error', error =>
        log.warn('ai', `local chat service did not start: ${String(error)}`),
      )
    },
    ping: () => pingOllama(port),
  })
  const install = async (onProgress: (progress: number) => void, signal: AbortSignal) => {
    remembered = null
    await installOllama({
      platform: process.platform,
      arch: process.arch,
      env: process.env,
      extraDir: directory,
      exists: existsSync,
      ensureFolder,
      download: fetchOllamaArchive,
      extract: extractOllamaArchive,
      remove: path => rm(path, { force: true }),
      chmod: path => chmod(path, 0o755),
      ensure,
      canUnpack: kind => !needsZstd(kind) || zstdOnPath(),
      onProgress,
      signal,
    })
    remembered = null
  }
  return { port, ensure, installed, install }
}

async function pingOllama(port: ReturnType<typeof ollamaHttpPort>): Promise<boolean> {
  try {
    await port.tags()
    return true
  } catch {
    return false
  }
}

function createRuntimes(input: {
  fetchedFiles: ReturnType<typeof fileRuntime>
  engine: ReturnType<typeof createEngine>
  llama: ReturnType<typeof electronLlamaPort>
  weightsOf: (model: LocalModel) => string
  modelOf: (id: string) => LocalModel | null
  hold: (id: string) => () => void
  ensureLoaded: (id: string) => Promise<void>
  ollama: ReturnType<typeof createOllama>
  stale: () => void
}): LocalRuntimes {
  return {
    'sherpa-onnx': input.fetchedFiles,
    'onnx-runtime': input.engine.runtime,
    diffusers: input.engine.runtime,
    plugin: input.engine.runtime,
    llamacpp: llamaLocalRuntime({
      files: input.fetchedFiles,
      weightsOf: input.weightsOf,
      port: input.llama,
      modelOf: input.modelOf,
      ensureLoaded: input.ensureLoaded,
      onUsed: input.hold,
    }),
    ollama: ollamaLocalRuntime(input.ollama.port, {
      ensure: input.ollama.ensure,
      onStale: input.stale,
    }),
  }
}

function createClouds(deps: LocalAiDeps, notReady: () => Promise<readonly WorkspaceId[]>) {
  const clouds: Record<string, { brain: () => AssistantBrain }> = {}
  for (const cloud of CLOUD_PROVIDERS) {
    const chat = cloud.chat
    if (!chat) continue
    if (chat.kind === 'scenario') clouds[cloud.id] = { brain: deps.providerBrain }
    else {
      const http = createHttpBrain(deps, cloud.id, chat, notReady)
      clouds[cloud.id] = { brain: () => http }
    }
  }
  return clouds
}

function createHttpBrain(
  deps: LocalAiDeps,
  cloud: string,
  chat: HttpChat,
  notReady: () => Promise<readonly WorkspaceId[]>,
) {
  return createHttpChatBrain({
    chat,
    cloud,
    credentials: () => deps.settings.readCredentialsFor(cloud),
    model: () => chatModelOf(deps.settings.read().assistant.cloudModels[cloud], chat.model),
    notReady,
  })
}

function createManager(
  deps: LocalAiDeps,
  modelFolder: () => string,
  llama: ReturnType<typeof electronLlamaPort>,
  runtimes: LocalRuntimes,
  ollama: ReturnType<typeof createOllama>,
  engine: ReturnType<typeof createEngine>,
  emit: (overview: AiOverview) => void,
) {
  return createAiManager({
    facts: () => hardwareProbe(electronHardwarePort(modelFolder, llama.vram)),
    snapshotOf: (facts, runtimeBytes) => memorySnapshotOf(facts, BUDGET, Date.now(), runtimeBytes),
    settings: () => deps.settings.read(),
    writeSettings: partial => deps.settings.write(partial),
    currentProjectPath: () => deps.project.current()?.path ?? null,
    readyClouds: () => readyCloudsOf(activeProvidersOf(deps.settings.accounts())),
    runtimes,
    emit,
    log: (level, message) => log[level]('ai', message),
    now: Date.now,
    ollamaInstalled: ollama.installed,
    engineMissing: async profile => {
      const client = await engine.supervisor.engine()
      if (!client) return null
      const needs = await client.requirements(profile)
      return [...needs.absent.map(one => one.name), ...needs.stale.map(one => one.name)]
    },
    installEngine: async (onProgress, signal, profile) => {
      const client = await engine.supervisor.engine()
      if (!client) throw notAnswering(engine.supervisor.whyNot())
      await installEngineLibraries({
        python: enginePython(),
        declaration: (await client.requirements(profile)).declaration,
        spawn: spawnLines,
        onProgress,
        signal,
      })
    },
    installOllama: ollama.install,
  })
}

function createVectors(
  deps: LocalAiDeps,
  ai: AiManager,
  modelOf: (id: string) => LocalModel | null,
  weightsOf: (model: LocalModel) => string,
) {
  const choices: EmbedChoiceDeps = {
    choices: () => deps.settings.read().ai.roles,
    byProject: () => deps.settings.read().ai.projectRoles,
    projectPath: () => deps.project.current()?.path ?? null,
    installedIds: () => ai.installedIds(),
    modelOf,
  }
  const embedder = createEmbedder({
    chosenId: () => embedModelId(choices),
    weightsFor: id => embedWeightsOf(choices, id, weightsOf),
    open: openEmbedProcess,
    onTrouble: why => log.warn('memory', why),
    idleMs: EMBEDDER_IDLE_MS,
    schedule: deps.schedule,
  })
  return {
    embedder,
    memoryVectors: createMemoryVectors({
      host: deps.memory,
      embedder,
      onProgress: (scope, progress) => broadcast(EVENTS.memoryIndexed, { scope, ...progress }),
      onTrouble: why => log.warn('memory', why),
      closeEmbedder: false,
    }),
  }
}

function createDictation(
  deps: LocalAiDeps,
  ai: AiManager,
  modelFolder: () => string,
  downloads: ReturnType<typeof createDownloadHost>,
) {
  return createSession({
    modelFolder,
    vadPath: () => bundledVad(resourcesRoot()),
    settings: () => deps.settings.read().dictation,
    modelIsReady: () => modelIsComplete(downloads, STT_MODEL, modelFolder()),
    download: (onProgress, signal) => ai.installModel(STT_MODEL, onProgress, signal),
    requestMicrophone: () =>
      requestMicrophone({
        platform: process.platform,
        status: () => systemPreferences.getMediaAccessStatus('microphone'),
        ask: () => systemPreferences.askForMediaAccess('microphone'),
      }),
    openEngine: openSttProcess,
    emit: event => broadcast(EVENTS.dictation, event),
    log: (level, message) => log[level]('dictation', message),
    join,
    schedule: deps.schedule,
  })
}
