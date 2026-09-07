import type { MemorySnapshot } from '@shared/domain/aiMemory'
import type { AiOverview } from '@shared/domain/aiOverview'
import type { LocalModel } from '@shared/domain/localModel'
import { GIBI, localModel } from '@shared/domain/localModel-fixtures'
import { DEFAULT_SETTINGS, type PartialSettings, type Settings } from '@shared/domain/settings'
import { describe, expect, it, vi } from 'vitest'
import type { HardwareFacts } from './hardwareProbe'
import type { LocalRuntime } from './localRuntimes'
import { createAiManager, type ManagerDeps } from './manager'

const FACTS: HardwareFacts = {
  platform: 'linux',
  arch: 'x64',
  cpuCount: 8,
  physicalBytes: 96 * GIBI,
  freeBytes: 34 * GIBI,
  diskFreeBytes: 500 * GIBI,
  gpu: null,
  vram: null,
}

const SNAPSHOT: MemorySnapshot = {
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
const idleRuntime = (install: LocalRuntime['install'] = () => Promise.resolve()): LocalRuntime => ({
  read: () => Promise.resolve({ ready: true, installed: new Set<string>(), loaded: new Set() }),
  install,
  remove: () => Promise.resolve(),
})

const manager = (over: Partial<ManagerDeps> = {}) =>
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
    installEngine: () => Promise.resolve(),
    ...over,
  })

/** One candidate of the whole overview, whichever row holds it. */
const candidateOf = (overview: AiOverview, modelId: string) =>
  overview.roles.flatMap(row => row.candidates).find(one => one.model.id === modelId)

const holdingRuntime = (over: Partial<LocalRuntime> = {}): LocalRuntime => {
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

const withOwnModel = (model: LocalModel): Settings => ({
  ...DEFAULT_SETTINGS,
  ai: { ...DEFAULT_SETTINGS.ai, ownModels: [model] },
})

describe('a model the person supplied', () => {
  const OWN = localModel({
    id: 'own-abc',
    name: 'Their weights',
    rank: 3,
    loader: 'sherpa-onnx',
    files: [],
    weightsPath: '/elsewhere/mine.gguf',
  })

  /**
   * Rank 3 of ADR-20 as amended: the entry is admitted and MARKED. A refusal made the whole rank
   * unreachable, and every model of it read as incompatible.
   */
  it('offers it beside the shipped ones, marked as unvouched for', async () => {
    const ai = manager({
      settings: () => withOwnModel(OWN),
      runtimes: { 'sherpa-onnx': holdingRuntime() },
    })

    const candidate = candidateOf(await ai.overview(), OWN.id)

    expect(candidate?.unverified).toBe(true)
    expect(candidate?.obstacle).not.toBe('refused')
  })

  /**
   * 🛑 Their file, their disk. Removing a supplied model drops the ENTRY and never the weights —
   * the studio was pointed at them, it did not put them there.
   */
  it('is removed from the list without its file being touched', async () => {
    const remove = vi.fn(() => Promise.resolve())
    let written: PartialSettings | null = null
    const ai = manager({
      settings: () => withOwnModel(OWN),
      writeSettings: partial => (written = partial),
      runtimes: { 'sherpa-onnx': holdingRuntime({ remove }) },
    })

    await ai.remove(OWN.id)

    expect(remove).not.toHaveBeenCalled()
    expect(written).toMatchObject({ ai: { ownModels: [] } })
  })

  /**
   * 🛑 Freed before the entry goes: dropped from the catalogue, no row would offer to unload it,
   * and the runtime would hold its weights with nothing left on screen to say so.
   */
  it('gives back the memory of one that was resident before forgetting it', async () => {
    const unload = vi.fn(() => Promise.resolve())
    const ai = manager({
      settings: () => withOwnModel(OWN),
      writeSettings: () => undefined,
      runtimes: { 'sherpa-onnx': holdingRuntime({ unload }) },
    })

    await ai.load(OWN.id)
    await ai.remove(OWN.id)

    expect(unload).toHaveBeenCalledOnce()
  })

  // There is nothing to fetch: the weights are where they put them, which `weightsPath` says.
  it('is never downloaded', async () => {
    const install = vi.fn(() => Promise.resolve())
    const ai = manager({
      settings: () => withOwnModel(OWN),
      runtimes: { 'sherpa-onnx': holdingRuntime({ install }) },
    })

    await ai.install(OWN.id)

    expect(install).not.toHaveBeenCalled()
  })

  // Pointing at the same file twice is one entry: two rows naming one file would each offer to
  // remove the other's.
  it('replaces its own entry rather than appearing twice', async () => {
    let written: PartialSettings | null = null
    const ai = manager({
      settings: () => withOwnModel(OWN),
      writeSettings: partial => (written = partial),
    })

    await ai.addOwnModel({ ...OWN, name: 'Renamed' })

    expect(written).toMatchObject({ ai: { ownModels: [{ id: OWN.id, name: 'Renamed' }] } })
  })
})
