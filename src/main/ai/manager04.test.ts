import { aiRoleId, DICTATION_ROLE } from '@shared/domain/aiRole'
import { STT_MODEL } from '@shared/domain/dictation'
import { localModel } from '@shared/domain/localModel-fixtures'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { describe, expect, it, vi } from 'vitest'
import type { LocalRuntime } from './localRuntimes'
import { candidateOf, FACTS, holdingRuntime, idleRuntime, manager } from './managerTest-fixtures'

describe('what a compose costs', () => {
  /**
   * `[M]` A compose reads `getGPUInfo`, a `statfs`, the memory and the video memory, and it runs
   * on every assistant turn — while what it reads moves in seconds. The reading is re-taken once
   * it has gone stale, and not before.
   */
  it('re-reads the machine only once its reading has gone stale', async () => {
    const facts = vi.fn(() => Promise.resolve(FACTS))
    let clock = 0
    const ai = manager({ facts, now: () => clock, factsTtlMs: 1_000 })

    await ai.overview()
    await ai.overview()
    expect(facts).toHaveBeenCalledOnce()

    clock = 2_000
    await ai.overview()
    expect(facts).toHaveBeenCalledTimes(2)
  })

  /**
   * 🛑 A narrowed reading covers ONE loader, and what it did not cover it cannot answer for.
   * Forgetting those bytes let the next admission over-commit what the runtime still held.
   */
  it('keeps what a narrowed reading never asked about', async () => {
    const ai = manager({ runtimes: { 'sherpa-onnx': holdingRuntime() } })

    await ai.load(STT_MODEL.id)
    // A role no `sherpa-onnx` model serves: the reading that follows names another loader entirely.
    await ai.providerOf(aiRoleId('image', 'txt2img'))

    expect(candidateOf(await ai.overview(), STT_MODEL.id)?.loaded).toBe(true)
  })

  /**
   * A role-specific lookup only reads the models useful to that role. It must not erase the
   * installed models owned by other loaders: inference hosts consult this inventory directly.
   */
  it('keeps installed models that a narrowed role reading never asked about', async () => {
    const image = localModel({
      id: 'image-local',
      format: 'safetensors',
      loader: 'diffusers',
      modality: 'image',
      files: [],
    })
    const ai = manager({
      settings: () => ({
        ...DEFAULT_SETTINGS,
        ai: { ...DEFAULT_SETTINGS.ai, ownModels: [image] },
      }),
      runtimes: {
        'sherpa-onnx': holdingRuntime(),
        diffusers: holdingRuntime(),
      },
    })

    await ai.overview()
    expect(ai.installedIds().has(STT_MODEL.id)).toBe(true)

    await ai.providerOf(aiRoleId('image', 'txt2img'))

    expect(ai.installedIds().has(STT_MODEL.id)).toBe(true)
  })

  /**
   * A loader answers on several doors. One `loaded` id used to drop the other door from occupancy
   * on the next compose, so admission over-committed and idle never freed it.
   */
  it('keeps both doors of one loader after a compose', async () => {
    const sana = localModel({
      id: 'sana',
      format: 'safetensors',
      loader: 'diffusers',
      modality: 'image',
      files: [],
    })
    const shap = localModel({
      id: 'shap',
      format: 'safetensors',
      loader: 'diffusers',
      modality: 'mesh',
      files: [],
    })
    const ai = manager({
      settings: () => ({
        ...DEFAULT_SETTINGS,
        ai: { ...DEFAULT_SETTINGS.ai, ownModels: [sana, shap] },
      }),
      runtimes: { diffusers: holdingRuntime() },
    })

    await ai.load(sana.id)
    await ai.load(shap.id)

    const after = await ai.overview()
    expect(candidateOf(after, sana.id)?.loaded).toBe(true)
    expect(candidateOf(after, shap.id)?.loaded).toBe(true)
  })

  /**
   * `[M]` `providerOf` used to compose the WHOLE overview and throw twenty rows away, on every
   * assistant turn — every runtime asked, every catalogue file stat'd. One role asks about the
   * models that role could take, and nothing else.
   */
  it('asks only about the models the role it was given could take', async () => {
    const asked: string[][] = []
    const watching = (): LocalRuntime => ({
      ...idleRuntime(),
      read: models => {
        asked.push(models.map(model => model.id))
        return Promise.resolve({ ready: true, installed: new Set<string>(), loaded: new Set() })
      },
    })

    const ai = manager({ runtimes: { 'sherpa-onnx': watching(), llamacpp: watching() } })
    await ai.providerOf(DICTATION_ROLE)

    expect(asked).toEqual([[STT_MODEL.id]])
  })

  /**
   * 🛑 ONE reading for the whole question, never one per role. `reconcile` walks every door of a
   * loader it sees, so a video-only reading reported `diffusers` with nothing loaded and dropped
   * the occupancy of an image model held on another of its five doors — on every assistant turn.
   * The six sweeps also raced on `onDisk`, which `installedIds` publishes to the model browser.
   */
  it('reads the runtimes once for the whole question, not once per role', async () => {
    let sweeps = 0
    const counting = (): LocalRuntime => ({
      ...idleRuntime(),
      read: () => {
        sweeps += 1
        return Promise.resolve({ ready: true, installed: new Set<string>(), loaded: new Set() })
      },
    })

    const ai = manager({ runtimes: { diffusers: counting(), llamacpp: counting() } })
    await ai.unservedRoles([aiRoleId('3d', 'txt23d'), aiRoleId('image', 'txt2img')])

    expect(sweeps).toBe(1)
  })

  // A choice, never a fill-in: nothing ticked means nothing serves it, whatever is on the disk.
  it('names every role nothing was chosen for', async () => {
    const ai = manager()
    const roles = [aiRoleId('image', 'txt2img'), aiRoleId('video', 'txt2video')]

    expect(await ai.unservedRoles(roles)).toEqual(roles)
  })
})

describe('motion engine requirements', () => {
  it('keeps the requested profile through inspection and installation', async () => {
    const engineMissing = vi.fn(async () => ({ missing: ['peft'], torchCuda: null }))
    const installEngine = vi.fn(async () => ({ cuda: false }))
    const ai = manager({ engineMissing, installEngine })
    expect((await ai.readEngine('motion')).engine).toMatchObject({
      profile: 'motion',
      missing: ['peft'],
    })
    await ai.installEngine('motion')
    expect(installEngine).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(AbortSignal),
      'motion',
    )
    expect(engineMissing).toHaveBeenLastCalledWith('motion')
  })

  /**
   * A CUDA install that lands a CPU torch is silent: the door still generates, on the processor,
   * and the card sits idle with nobody told. Reading it back is the whole point of asking.
   */
  it('says so when the CUDA wheels were asked for and the torch still answers none', async () => {
    const log = vi.fn()
    const ai = manager({
      log,
      installEngine: () => Promise.resolve({ cuda: true }),
      engineMissing: () => Promise.resolve({ missing: [], torchCuda: false }),
    })

    await ai.installEngine()

    expect(log).toHaveBeenCalledWith('warn', expect.stringContaining('CUDA'))
  })
})
