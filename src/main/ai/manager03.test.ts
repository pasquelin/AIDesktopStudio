import { STT_MODEL } from '@shared/domain/dictation'
import type { LocalModel } from '@shared/domain/localModel'
import { localModel } from '@shared/domain/localModel-fixtures'
import { DEFAULT_SETTINGS, type PartialSettings, type Settings } from '@shared/domain/settings'
import { describe, expect, it, vi } from 'vitest'
import type { LocalRuntime } from './localRuntimes'
import { candidateOf, holdingRuntime, manager } from './managerTest-fixtures'

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

describe('closing the door a release emptied', () => {
  const QWEN = STT_MODEL

  const idling = (over: Partial<LocalRuntime>) => {
    const armed: { run: (() => void) | null } = { run: null }
    const runtime = holdingRuntime()
    const ai = manager({
      idleUnloadMinutes: () => 10,
      schedule: run => {
        armed.run = run
        return () => {
          armed.run = null
        }
      },
      runtimes: { 'sherpa-onnx': { ...runtime, ...over } },
    })
    return { ai, armed }
  }

  /**
   * 🛑 Killing the process hands back the tensors AND the 208 MB of imports an unload never
   * returned, so unloading first pays a routed round trip and a `gc.collect()` over gigabytes one
   * line before dropping the process that held them.
   */
  it('kills the door instead of emptying it first', async () => {
    const unload = vi.fn()
    const close = vi.fn()
    const { ai, armed } = idling({ unload, close })

    await ai.load(QWEN.id)
    armed.run?.()

    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(unload).not.toHaveBeenCalled()
  })

  /** A runtime whose process the studio does not own has nothing to kill, and still empties. */
  it('falls back to emptying a door it cannot close', async () => {
    const unload = vi.fn()
    const { ai, armed } = idling({ unload })

    await ai.load(QWEN.id)
    armed.run?.()

    await vi.waitFor(() => expect(unload).toHaveBeenCalledOnce())
  })
})
