/**
 * The machine, the runtimes and the manager the four `manager0*.test.ts` suites stand on — the same
 * 78 lines opened each of them. `overview.test.ts` shares the snapshot alone: its facts describe a
 * machine WITH a GPU, so they stay where they are read.
 */
import type { MemorySnapshot } from '@shared/domain/aiMemory'
import type { AiOverview } from '@shared/domain/aiOverview'
import { STT_MODEL } from '@shared/domain/dictation'
import type { LocalModel } from '@shared/domain/localModel'
import { GIBI } from '@shared/domain/localModel-fixtures'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import type { HardwareFacts } from './hardwareProbe'
import type { LocalRuntime } from './localRuntimes'
import { createAiManager, type ManagerDeps } from './manager'

export const FACTS: HardwareFacts = {
  platform: 'linux',
  arch: 'x64',
  cpuCount: 8,
  physicalBytes: 96 * GIBI,
  freeBytes: 34 * GIBI,
  diskFreeBytes: 500 * GIBI,
  gpu: null,
  vram: null,
}

export const SNAPSHOT: MemorySnapshot = {
  domain: 'unified',
  source: 'probe',
  at: 0,
  physicalBytes: 96 * GIBI,
  appBudgetBytes: 48 * GIBI,
  rendererReservedBytes: GIBI,
  runtimeBytes: {},
  headroomBytes: 2 * GIBI,
  availableBytes: 34 * GIBI,
}

/** A runtime that installs nothing and holds nothing — what most of these cases need behind them. */
export const idleRuntime = (
  install: LocalRuntime['install'] = () => Promise.resolve(),
): LocalRuntime => ({
  read: () => Promise.resolve({ ready: true, installed: new Set<string>(), loaded: new Set() }),
  install,
  remove: () => Promise.resolve(),
})

export const holdingRuntime = (over: Partial<LocalRuntime> = {}): LocalRuntime => {
  const held = new Set<string>()

  return {
    read: models =>
      Promise.resolve({
        ready: true,
        installed: new Set(models.map(model => model.id)),
        loaded: new Set(models.filter(model => held.has(model.id)).map(model => model.id)),
      }),
    install: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    load: (model, options) => {
      options.onProgress(0.5)
      held.add(model.id)
      return Promise.resolve(3 * GIBI)
    },
    unload: () => {
      held.clear()
      return Promise.resolve()
    },
    ...over,
  }
}

export const manager = (over: Partial<ManagerDeps> = {}) =>
  createAiManager({
    facts: () => Promise.resolve(FACTS),
    snapshotOf: () => SNAPSHOT,
    settings: () => DEFAULT_SETTINGS,
    writeSettings: () => undefined,
    currentProjectPath: () => null,
    readyClouds: () => [],
    runtimes: { 'sherpa-onnx': idleRuntime(), ollama: idleRuntime() },
    emit: () => {},
    log: () => {},
    now: () => 0,
    idleUnloadMinutes: () => 0,
    ollamaInstalled: () => false,
    installOllama: () => Promise.resolve(),
    engineMissing: () => Promise.resolve(null),
    installEngine: () => Promise.resolve({ cuda: false }),
    ...over,
  })

export const other = (id: string): LocalModel => ({ ...STT_MODEL, id })

/** One candidate of the whole overview, whichever row holds it. */
export const candidateOf = (overview: AiOverview, modelId: string) =>
  overview.roles.flatMap(row => row.candidates).find(one => one.model.id === modelId)
