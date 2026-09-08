import type { AiOverview, OwnModelProfile } from '@shared/domain/aiOverview'
import type { RuntimeReading } from './localRuntimes'
import type { ModelLoader } from '@shared/domain/localModel'
import { DownloadCancelled } from './modelInstall'
import type { EngineEnvironment, ManagerDeps } from './managerTypes'

type InstallerView = {
  ollamaReady: boolean
  ollamaInstalled: boolean
  ollamaProgress: number | null
  ollamaFailed: boolean
  engineProfile?: OwnModelProfile
  engineKnown: boolean
  engineMissing: readonly string[]
  engineTorchCuda: boolean | null
  engineProgress: number | null
  engineFailed: boolean
}

export type RuntimeInstaller = {
  view: (readings: ReadonlyMap<ModelLoader, RuntimeReading>) => InstallerView
  installOllama: () => Promise<AiOverview>
  cancelOllama: () => Promise<AiOverview>
  readEngine: (profile?: OwnModelProfile) => Promise<AiOverview>
  installEngine: (profile?: OwnModelProfile) => Promise<AiOverview>
  cancelEngine: () => Promise<AiOverview>
  isInstallingOllama: () => boolean
}

type InstallerHost = {
  announce: () => Promise<AiOverview>
  compose: () => Promise<AiOverview>
  current: () => AiOverview | null
  republish: (patch: Partial<AiOverview>) => void
  forgetDiscovered: () => void
  modelInstallRunning: () => boolean
}

export function createRuntimeInstaller(deps: ManagerDeps, host: InstallerHost): RuntimeInstaller {
  let ollamaAbort: AbortController | null = null
  let ollamaProgress: number | null = null
  let ollamaFailed = false
  let ollamaDone: Promise<AiOverview> | null = null
  let engineProfile: OwnModelProfile | undefined
  let engineReadVersion = 0
  let engineEnvironment: EngineEnvironment | null = null
  let engineProgress: number | null = null
  let engineFailed = false
  let engineDone: Promise<AiOverview> | null = null
  let engineAbort: AbortController | null = null

  function reportOllamaProgress(ratio: number): void {
    ollamaProgress = ratio
    const current = host.current()
    if (current === null) void host.announce()
    else host.republish({ ollama: { ...current.ollama, progress: ratio } })
  }

  function reportEngineProgress(ratio: number): void {
    engineProgress = ratio
    const current = host.current()
    if (current === null) void host.announce()
    else host.republish({ engine: { ...current.engine, profile: engineProfile, progress: ratio } })
  }

  async function runEngineInstall(profile?: OwnModelProfile): Promise<AiOverview> {
    engineReadVersion += 1
    engineProfile = profile
    engineEnvironment = null
    engineAbort = new AbortController()
    engineProgress = 0
    engineFailed = false
    void host.announce()
    try {
      await deps.installEngine(reportEngineProgress, engineAbort.signal, profile)
      engineEnvironment = await deps.engineMissing(profile)
    } catch (error) {
      engineFailed = true
      deps.log('warn', `the engine repair stopped: ${String(error)}`)
    } finally {
      engineAbort = null
      engineProgress = null
    }
    return host.announce()
  }

  async function runOllamaInstall(): Promise<AiOverview> {
    ollamaAbort = new AbortController()
    ollamaProgress = 0
    ollamaFailed = false
    void host.announce()
    try {
      await deps.installOllama(reportOllamaProgress, ollamaAbort.signal)
      host.forgetDiscovered()
    } catch (error) {
      if (!(error instanceof DownloadCancelled)) {
        ollamaFailed = true
        deps.log('warn', `Ollama install stopped: ${String(error)}`)
      }
    } finally {
      ollamaAbort = null
      ollamaProgress = null
    }
    return host.announce()
  }

  async function trackedEngineInstall(profile?: OwnModelProfile): Promise<AiOverview> {
    try {
      return await runEngineInstall(profile)
    } finally {
      engineDone = null
    }
  }

  async function trackedOllamaInstall(): Promise<AiOverview> {
    try {
      return await runOllamaInstall()
    } finally {
      ollamaDone = null
    }
  }

  return {
    view: readings => ({
      ollamaReady: readings.get('ollama')?.ready === true,
      ollamaInstalled: deps.ollamaInstalled(),
      ollamaProgress,
      ollamaFailed,
      ...(engineProfile ? { engineProfile } : {}),
      engineKnown: engineEnvironment !== null,
      engineMissing: engineEnvironment?.missing ?? [],
      engineTorchCuda: engineEnvironment?.torchCuda ?? null,
      engineProgress,
      engineFailed,
    }),
    installOllama: () => {
      if (ollamaDone) return ollamaDone
      if (host.modelInstallRunning()) {
        deps.log('warn', 'Ollama install skipped: a model download already holds the disk')
        return host.compose()
      }
      ollamaDone = trackedOllamaInstall()
      return ollamaDone
    },
    cancelOllama: async () => {
      ollamaAbort?.abort()
      return host.current() ?? host.compose()
    },
    readEngine: async profile => {
      if (engineDone) return host.current() ?? host.compose()
      const revision = ++engineReadVersion
      const answered = await deps.engineMissing(profile)
      if (revision === engineReadVersion && !engineDone) {
        engineProfile = profile
        engineEnvironment = answered
      }
      return host.compose()
    },
    installEngine: profile => {
      if (engineDone) return engineDone
      engineDone = trackedEngineInstall(profile)
      return engineDone
    },
    cancelEngine: async () => {
      engineAbort?.abort()
      return host.current() ?? host.compose()
    },
    isInstallingOllama: () => ollamaAbort !== null,
  }
}
