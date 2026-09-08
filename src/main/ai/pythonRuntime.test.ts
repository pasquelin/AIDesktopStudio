import { describe, expect, it, vi } from 'vitest'
import { localModel } from '@shared/domain/localModel-fixtures'
import type { PythonClient } from './pythonClient'
import type { EngineSettledJob } from './pythonProtocol'
import type { GenerateRequest } from './localRuntimes'
import { runtimeEndpointId } from '@shared/domain/aiRuntime'
import { pythonRuntime, type PythonRuntimeDeps } from './pythonRuntime'

const MODEL = localModel({
  id: 'sana',
  loader: 'diffusers',
  format: 'safetensors',
  modality: 'image',
})

const MIA = localModel({
  id: 'make-it-animatable',
  backendId: 'make-it-animatable',
  loader: 'plugin',
  format: 'pickle',
  modality: 'mesh',
  readsTorchWeights: true,
})

const settled = (over: Partial<EngineSettledJob> = {}): EngineSettledJob => ({
  v: 1,
  evt: 'job.completed',
  job: 'local_1',
  ...over,
})

function harness(over: Partial<PythonClient> = {}, deps: Partial<PythonRuntimeDeps> = {}) {
  // Wrapped rather than defaulted: a test that supplies its own answer must still be the one the
  // spy records, or the assertion reads a call nobody made.
  const job = vi.fn(over.job ?? (() => Promise.resolve(settled())))
  const memory = vi.fn(over.memory ?? (() => Promise.resolve([])))
  const requirements = vi.fn(
    over.requirements ??
      (() =>
        Promise.resolve({
          extra: 'diffusion',
          declaration: [],
          absent: [],
          stale: [],
          torchCuda: null,
          complete: true,
        })),
  )
  const closeDoor = vi.fn(over.closeDoor ?? (() => Promise.resolve(true)))

  const client = { ...over, job, memory, requirements, closeDoor } as unknown as PythonClient

  const runtime = pythonRuntime({
    folderFor: model => `/models/${model.id}`,
    isComplete: () => Promise.resolve(true),
    fetch: () => Promise.resolve(),
    removeFiles: () => Promise.resolve(),
    baseOf: () => null,
    engine: () => Promise.resolve(client),
    running: () => client,
    whyNot: () => null,
    log: () => {},
    ...deps,
  })

  return { runtime, job, memory, requirements, closeDoor }
}

describe('reading what the engine holds', () => {
  /**
   * The LEDGER and never `worker.status`: asking a door would fork a Python process and pay 682 MB
   * of imports to be told it holds nothing.
   */
  it('asks the core rather than waking a door', async () => {
    const held = harness()
    await held.runtime.read([MODEL])

    expect(held.memory).toHaveBeenCalled()
    expect(held.job).not.toHaveBeenCalled()
  })

  /**
   * Measured 2026-08-22: forking the interpreter and reading `engine.hello` costs 28,8 ms,
   * median of five.
   */
  it('never starts the engine to answer what is on the disk', async () => {
    const started = vi.fn(() => Promise.resolve(null))
    const { runtime } = harness({}, { engine: started, running: () => null })

    await runtime.read([MODEL])

    expect(started).not.toHaveBeenCalled()
  })

  it('is ready with no engine running, because installing needs none', async () => {
    const { runtime } = harness({}, { running: () => null })

    const reading = await runtime.read([MODEL])
    expect(reading.ready).toBe(true)
    expect(reading.loaded.size).toBe(0)
  })

  it('holds nothing before a load', async () => {
    const { runtime } = harness()

    expect((await runtime.read([MODEL])).loaded.size).toBe(0)
  })

  it('names what it loaded once a door holds bytes for it', async () => {
    const doors = [{ door: 'engine/diffusion', heldBytes: 2, device: 'mps', backend: 'pytorch' }]
    const held = harness({ memory: () => Promise.resolve(doors) })

    await held.runtime.load?.(MODEL, { onProgress: () => {} })

    expect((await held.runtime.read([MODEL])).loaded).toEqual(new Set(['sana']))
  })

  /**
   * A door answering ZERO is a release confirmed. A door that is ABSENT is not a denial: a
   * backend with no counter — the CPU one — never reaches the ledger at all, and clearing on
   * that silence left a model nothing could ever free.
   */
  it('forgets a door that answered zero, and keeps one the ledger never named', async () => {
    const zeroed = harness({
      memory: () =>
        Promise.resolve([
          { door: 'engine/diffusion', heldBytes: 0, device: 'cpu', backend: 'pytorch' },
        ]),
    })
    await zeroed.runtime.load?.(MODEL, { onProgress: () => {} })
    expect((await zeroed.runtime.read([MODEL])).loaded.size).toBe(0)

    const silent = harness()
    await silent.runtime.load?.(MODEL, { onProgress: () => {} })
    expect((await silent.runtime.read([MODEL])).loaded).toEqual(new Set(['sana']))
  })

  /** Its processes went with it, so it holds nothing — a measurement, not an assumption. */
  it('forgets everything once the engine is no longer running', async () => {
    const held = harness({}, { running: () => null })
    await held.runtime.load?.(MODEL, { onProgress: () => {} })

    expect((await held.runtime.read([MODEL])).loaded.size).toBe(0)
  })
})

describe('loading', () => {
  it('hands the door the folder the studio wrote the weights into', async () => {
    const held = harness()
    await held.runtime.load?.(MODEL, { onProgress: () => {} })

    expect(held.job).toHaveBeenCalledWith(
      'models.load',
      {
        modelId: 'sana',
        folder: '/models/sana',
        attachFolder: undefined,
        door: 'engine/diffusion',
        torchWeights: false,
      },
      expect.anything(),
    )
  })

  /** A MEASUREMENT, where `reservationBytes` is only what a publisher announced — R3. */
  it('answers what the door measured rather than what the manifest announced', async () => {
    const held = harness({ job: () => Promise.resolve(settled({ heldBytes: 7_766_163_456 })) })

    expect(await held.runtime.load?.(MODEL, { onProgress: () => {} })).toBe(7_766_163_456)
  })

  it('falls back to the reservation when the backend answered no figure', async () => {
    const held = harness()

    expect(await held.runtime.load?.(MODEL, { onProgress: () => {} })).toBe(MODEL.reservationBytes)
  })

  // Measured 2026-09-06 (Codex by MCP, worktree without `pnpm engine:fetch`): the job ended on the
  // bare word `rejected`. The supervisor knows why the engine will not come; the throw says it.
  it('names the reason the engine will not come, so a job says "not installed" rather than "rejected"', async () => {
    const { runtime } = harness(
      {},
      { engine: () => Promise.resolve(null), whyNot: () => 'engine-missing' },
    )

    await expect(runtime.load?.(MODEL, { onProgress: () => {} })).rejects.toThrow('engine-missing')
  })

  it('refuses readably when the engine is not answering', async () => {
    const { runtime } = harness({}, { engine: () => Promise.resolve(null) })

    await expect(runtime.load?.(MODEL, { onProgress: () => {} })).rejects.toThrow(/not answering/)
  })
})

describe('generating', () => {
  const request: GenerateRequest = {
    model: 'sana',
    modality: 'image',
    prompt: 'a red cube',
    fields: { steps: 8 },
    destination: '/tmp/out.png',
    onProgress: () => {},
  }

  it('hands the door the prompt, the form and where to write', async () => {
    const held = harness({ job: () => Promise.resolve(settled({ path: '/tmp/out.png' })) })
    await held.runtime.generate?.(request)

    expect(held.job).toHaveBeenCalledWith(
      'generate',
      { steps: 8, prompt: 'a red cube', destination: '/tmp/out.png', door: 'engine/diffusion' },
      expect.anything(),
    )
  })

  /** A model that fell back to the CPU is indistinguishable from a slow machine unless it is said. */
  it('answers what actually ran it', async () => {
    const held = harness({
      job: () =>
        Promise.resolve(settled({ path: '/tmp/out.png', device: 'mps', backend: 'pytorch' })),
    })

    expect(await held.runtime.generate?.(request)).toEqual({
      path: '/tmp/out.png',
      device: 'mps',
      backend: 'pytorch',
    })
  })

  it('says it does not know rather than naming a device the door never reported', async () => {
    const held = harness({ job: () => Promise.resolve(settled({ path: '/tmp/out.png' })) })

    expect(await held.runtime.generate?.(request)).toMatchObject({ device: 'unknown' })
  })

  it('refuses an answer that carries no path', async () => {
    const held = harness()

    await expect(held.runtime.generate?.(request)).rejects.toThrow(/no path/)
  })
})

describe('the door a request names', () => {
  it('sends a video to a process of its own rather than to the image door', async () => {
    const held = harness({ job: () => Promise.resolve(settled({ path: '/tmp/out.mp4' })) })

    await held.runtime.generate?.({
      model: 'wan',
      modality: 'video',
      prompt: 'a wave',
      fields: {},
      destination: '/tmp/out.mp4',
      onProgress: () => {},
    })

    expect(held.job).toHaveBeenCalledWith(
      'generate',
      expect.objectContaining({ door: 'engine/video' }),
      expect.anything(),
    )
  })

  /** Waking a door this runtime never loaded into would fork a process to free what it has not. */
  it('asks nothing at all when nothing was loaded through it', async () => {
    const held = harness()

    await held.runtime.unload?.()

    expect(held.job).not.toHaveBeenCalled()
  })

  it('frees the door that is holding, not the one a default would name', async () => {
    const held = harness()
    await held.runtime.load?.({ ...MODEL, modality: 'mesh' }, { onProgress: () => {} })

    await held.runtime.unload?.()

    expect(held.job).toHaveBeenLastCalledWith('models.unload', { door: 'engine/3d' })
  })

  /**
   * A door is a PROCESS, so two modalities are two residents at once — and a release names one.
   * Freeing "the last one loaded" would kill the wrong process while the plan recorded the other
   * as freed, and the bytes of the first could never be reclaimed.
   */
  it('names both residents after two loads', async () => {
    const held = harness()
    await held.runtime.load?.({ ...MODEL, modality: 'image' }, { onProgress: () => {} })
    await held.runtime.load?.({ ...MODEL, id: 'shap', modality: 'mesh' }, { onProgress: () => {} })

    expect(await held.runtime.read([MODEL, { ...MODEL, id: 'shap', modality: 'mesh' }])).toEqual(
      expect.objectContaining({ loaded: new Set(['sana', 'shap']) }),
    )
  })

  it('frees the door a plan named, and leaves the other resident', async () => {
    const held = harness()
    await held.runtime.load?.({ ...MODEL, modality: 'image' }, { onProgress: () => {} })
    await held.runtime.load?.({ ...MODEL, id: 'shap', modality: 'mesh' }, { onProgress: () => {} })

    await held.runtime.unload?.(runtimeEndpointId('diffusers', 'diffusion'))

    expect(held.job).toHaveBeenLastCalledWith('models.unload', { door: 'engine/diffusion' })
    await held.runtime.unload?.()
    expect(held.job).toHaveBeenLastCalledWith('models.unload', { door: 'engine/3d' })
  })

  /**
   * A backend that counts no bytes — the CPU one — never reaches the ledger, and a reading used
   * to clear what was loaded on that silence: the model could then never be freed at all.
   */
  it('keeps what it loaded through a reading that measured nothing', async () => {
    const held = harness()
    await held.runtime.load?.(MODEL, { onProgress: () => {} })

    await held.runtime.read([MODEL])
    await held.runtime.unload?.()

    expect(held.job).toHaveBeenLastCalledWith('models.unload', { door: 'engine/diffusion' })
  })
})

describe('unloading', () => {
  it('does not start the engine to unload nothing', async () => {
    const started = vi.fn(() => Promise.resolve(null))
    const { runtime } = harness({}, { engine: started, running: () => null })

    await runtime.unload?.()

    expect(started).not.toHaveBeenCalled()
  })

  it('keeps what it held when the door refuses the unload', async () => {
    const doors = [{ door: 'engine/diffusion', heldBytes: 2, device: 'mps', backend: 'pytorch' }]
    const held = harness({
      memory: () => Promise.resolve(doors),
      job: op =>
        op === 'models.unload'
          ? Promise.reject(new Error('door-gone'))
          : Promise.resolve(settled({ heldBytes: 2 })),
    })
    await held.runtime.load?.(MODEL, { onProgress: () => {} })

    await expect(held.runtime.unload?.()).rejects.toThrow(/door-gone/)
    expect((await held.runtime.read([MODEL])).loaded).toEqual(new Set(['sana']))
  })

  /** `admit` releases the door it is about to load onto: closing there repays a cold start. */
  it('hands the tensors back without ending the process', async () => {
    const held = harness()
    await held.runtime.load?.(MODEL, { onProgress: () => {} })

    await held.runtime.unload?.()

    expect(held.closeDoor).not.toHaveBeenCalled()
  })
})

describe('closing a door', () => {
  /** Measured 2026-09-08: a door that called `device()` never drops below 208 MB again. */
  it('ends the process behind the endpoint it was given', async () => {
    const held = harness()

    await held.runtime.close?.(runtimeEndpointId('diffusers', 'diffusion'))

    expect(held.closeDoor).toHaveBeenCalledWith('engine/diffusion')
  })

  /** Its processes went with it, so there is nothing to close and no reason to start one. */
  it('does not start the engine to close a door', async () => {
    const started = vi.fn(() => Promise.resolve(null))
    const { runtime } = harness({}, { engine: started, running: () => null })

    await runtime.close?.(runtimeEndpointId('diffusers', 'diffusion'))

    expect(started).not.toHaveBeenCalled()
  })
})

describe('the weights a door may read', () => {
  /**
   * Declared per ENTRY and never per loader: it weakens a rule, and Shap-E is the one model that
   * needs it — the only 3D pipeline diffusers carries, published with a `.bin` renderer alone.
   */
  it('lets a door read torch tensors only where the manifest said so', async () => {
    const held = harness()
    await held.runtime.load?.({ ...MODEL, readsTorchWeights: true }, { onProgress: () => {} })

    expect(held.job).toHaveBeenCalledWith(
      'models.load',
      expect.objectContaining({ torchWeights: true }),
      expect.anything(),
    )
  })
})

describe('weights that complete another model', () => {
  const ADAPTER = localModel({
    id: 'ip-adapter-sdxl',
    loader: 'diffusers',
    modality: 'image',
    attaches: { model: 'ssd-1b', as: 'ip-adapter', subfolder: 'sdxl_models' },
  })

  /**
   * The door holds ONE pipeline, and an attachment is not one: it grafts onto the base, so it is
   * the base's folder that is loaded and the attachment travels beside it.
   */
  it('loads the model it completes, and hands the attachment beside it', async () => {
    const base = localModel({ id: 'ssd-1b', loader: 'diffusers', modality: 'image' })
    const held = harness({}, { baseOf: () => base })

    await held.runtime.load?.(ADAPTER, { onProgress: () => {} })

    expect(held.job).toHaveBeenCalledWith(
      'models.load',
      expect.objectContaining({
        folder: '/models/ssd-1b',
        attachFolder: '/models/ip-adapter-sdxl',
        attachAs: 'ip-adapter',
        attachSubfolder: 'sdxl_models',
      }),
      expect.anything(),
    )
  })

  /** A door handed an attachment with no base would load neither, and say so from further away. */
  it('sends no half plan when the base is unknown', async () => {
    const held = harness({}, { baseOf: () => null })

    await held.runtime.load?.(ADAPTER, { onProgress: () => {} })

    expect(held.job).toHaveBeenCalledWith(
      'models.load',
      expect.objectContaining({ attachFolder: undefined }),
      expect.anything(),
    )
  })
})

describe('a door whose environment is incomplete', () => {
  it('checks the embedded Auto Rig profile before loading MIA', async () => {
    const held = harness()

    await held.runtime.load?.(MIA, { onProgress: () => {} })

    expect(held.requirements).toHaveBeenCalledWith('autorig')
  })

  /**
   * Asked before the door is woken: an absent library fails as an `ImportError` three frames inside
   * a worker, and reaches the person as a door that died with no name to act on.
   */
  it('refuses the load naming what has to be installed', async () => {
    const held = harness({
      requirements: () =>
        Promise.resolve({
          extra: 'diffusion',
          declaration: ['torch>=2.6', 'torchvision>=0.21'],
          absent: [{ name: 'torchvision', wanted: '>=0.21' }],
          stale: [{ name: 'torch', wanted: '>=2.6', installed: '2.1.0' }],
          torchCuda: null,
          complete: false,
        }),
    })

    await expect(held.runtime.load?.(MODEL, { onProgress: () => {} })).rejects.toThrow(
      'torchvision, torch 2.1.0 (needs >=2.6)',
    )
    expect(held.job).not.toHaveBeenCalled()
  })
})

describe('a supplied motion model', () => {
  it('checks motion dependencies and loads the registered backend from its local folder', async () => {
    const held = harness({}, { folderFor: model => model.weightsPath ?? '/unused' })
    const model = localModel({
      id: 'own-motion',
      backendId: 'kimodo-soma-rp-v1.1',
      loader: 'plugin',
      modality: 'motion',
      weightsPath: '/weights/motion',
    })
    await held.runtime.load?.(model, { onProgress: () => {} })
    expect(held.requirements).toHaveBeenCalledWith('motion')
    expect(held.job).toHaveBeenCalledWith(
      'models.load',
      expect.objectContaining({
        modelId: 'kimodo-soma-rp-v1.1',
        folder: '/weights/motion',
      }),
      expect.anything(),
    )
  })
})
