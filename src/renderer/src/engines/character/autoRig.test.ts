import { localizedError } from '@shared/localizedError'
import { describe, expect, it, vi } from 'vitest'
import type { AutoRigPrimitiveTarget, AutoRigResult } from '@shared/domain/autoRig'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import type { AutoRigBackend } from './autoRig'
import { AutoRigService } from './autoRig'
import { simpleAutoRigBackend } from './simpleAutoRigBackend'
import { makeItAnimatableBackend } from './makeItAnimatableBackend'

const descriptor: Omit<AutoRigBackend<string>, 'run'> = {
  id: 'simple',
  requiresModel: false,
  modelIds: [],
  devices: ['cpu'],
  experimental: false,
  capabilities: {
    target: 'humanoid',
    skeleton: true,
    skinWeights: true,
    fingers: false,
    local: true,
  },
}

const result: AutoRigResult = {
  rig: { bones: [{ name: 'Hips', parent: null, rest: IDENTITY_TRANSFORM }], origin: 'local' },
  bindings: [
    {
      mesh: 0,
      primitive: 0,
      skinIndex: new Uint16Array([0, 0, 0, 0]),
      skinWeight: new Float32Array([1, 0, 0, 0]),
    },
  ],
  metadata: { backendId: 'ignored', sourceInfluences: 4, outputInfluences: 4, fingers: false },
}

const serving = (run: AutoRigBackend<string>['run']): AutoRigService<string> =>
  new AutoRigService([{ ...descriptor, run }])

/** What a run carries: the abort, the progress, and the primitives the result has to cover. */
const asking = (targets: readonly AutoRigPrimitiveTarget[]) => ({
  signal: new AbortController().signal,
  onProgress: vi.fn(),
  targets,
})

const ONE_VERTEX: readonly AutoRigPrimitiveTarget[] = [{ mesh: 0, primitive: 0, vertexCount: 1 }]

describe('Auto Rig backends', () => {
  it('selects a backend without exposing its implementation to the caller', async () => {
    const run = vi.fn(async () => result)
    const service = serving(run)
    const context = asking(ONE_VERTEX)

    await expect(service.run('simple', 'mesh', context)).resolves.toMatchObject({
      metadata: { backendId: 'simple' },
    })
    expect(run).toHaveBeenCalledWith('mesh', context)
    expect(service.available()).toEqual([descriptor])
  })

  it('refuses duplicate identifiers so selection stays deterministic', () => {
    const backend: AutoRigBackend<string> = { ...descriptor, run: async () => result }

    expect(() => new AutoRigService([backend, backend])).toThrow(
      localizedError('autoRigBackendDuplicate', { name: backend.id }).message,
    )
  })

  it('discards a result that arrives after cancellation', async () => {
    const controller = new AbortController()
    const service = serving(async () => {
      controller.abort()
      return result
    })

    await expect(
      service.run('simple', 'mesh', { ...asking(ONE_VERTEX), signal: controller.signal }),
    ).rejects.toThrow('CANCELLED')
  })

  it('refuses a backend result that does not cover the source primitives exactly', async () => {
    const service = serving(async () => result)

    await expect(
      service.run('simple', 'mesh', asking([{ mesh: 1, primitive: 0, vertexCount: 10 }])),
    ).rejects.toThrow('invalid-binding-target')
  })

  it('refuses a binding whose vertex count differs from its source primitive', async () => {
    const service = serving(async () => result)

    await expect(
      service.run('simple', 'mesh', asking([{ mesh: 0, primitive: 0, vertexCount: 2 }])),
    ).rejects.toThrow('invalid-binding-size')
  })

  it('refuses an empty binding result', async () => {
    const service = serving(async () => ({ ...result, bindings: [] }))

    await expect(service.run('simple', 'mesh', asking(ONE_VERTEX))).rejects.toThrow(
      'invalid-binding-size',
    )
  })

  it('keeps the current local rigger available without a model dependency', () => {
    const backend = simpleAutoRigBackend(async () => result)

    expect(backend).toMatchObject({
      id: 'simple',
      requiresModel: false,
      modelIds: [],
      devices: ['cpu'],
      experimental: false,
    })
    expect(backend.capabilities).toMatchObject({ target: 'humanoid', fingers: false, local: true })
  })

  it('passes cancellation and progress through the advanced backend boundary', async () => {
    const signal = new AbortController().signal
    const infer = vi.fn(async () => ({
      jointNames: ['Hips'],
      parents: new Int16Array([-1]),
      joints: new Float32Array([0, 0, 0]),
      tails: new Float32Array([0, 1, 0]),
      weights: new Float32Array([1]),
      sourceInfluences: 1,
      modelToInput: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
      inputToModel: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
      primitives: [{ mesh: 0, primitive: 0, vertexOffset: 0, vertexCount: 1 }],
      device: 'cpu',
      loadMs: 1,
      inferenceMs: 2,
      peakRssBytes: 3,
    }))
    const progress = vi.fn()
    const backend = makeItAnimatableBackend(infer)

    expect(backend).toMatchObject({
      id: 'make-it-animatable',
      requiresModel: true,
      modelIds: ['make-it-animatable'],
      devices: ['mps', 'cpu'],
      experimental: true,
    })

    await backend.run('mesh', { signal, onProgress: progress, targets: ONE_VERTEX })

    expect(infer).toHaveBeenCalledWith('mesh', signal)
    expect(progress.mock.calls).toEqual([[0], [1]])
  })
})
