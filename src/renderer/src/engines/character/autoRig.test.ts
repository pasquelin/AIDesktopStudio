import { describe, expect, it, vi } from 'vitest'
import type { AutoRigResult } from '@shared/domain/autoRig'
import type { AutoRigBackend } from './autoRig'
import { AutoRigService } from './autoRig'
import { simpleAutoRigBackend } from './simpleAutoRigBackend'
import { makeItAnimatableBackend } from './makeItAnimatableBackend'

const descriptor: Omit<AutoRigBackend<string>, 'run'> = {
  id: 'test',
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
  rig: {
    bones: [
      {
        name: 'Hips',
        parent: null,
        rest: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
      },
    ],
    origin: 'local',
  },
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

describe('Auto Rig backends', () => {
  it('selects a backend without exposing its implementation to the caller', async () => {
    const run = vi.fn(async () => result)
    const backend: AutoRigBackend<string> = { ...descriptor, run }
    const service = new AutoRigService([backend])
    const context = {
      signal: new AbortController().signal,
      onProgress: vi.fn(),
      targets: [{ mesh: 0, primitive: 0, vertexCount: 1 }],
    }

    await expect(service.run('test', 'mesh', context)).resolves.toMatchObject({
      metadata: { backendId: 'test' },
    })
    expect(run).toHaveBeenCalledWith('mesh', context)
    expect(service.available()).toEqual([descriptor])
  })

  it('refuses duplicate identifiers so selection stays deterministic', () => {
    const backend: AutoRigBackend<string> = {
      ...descriptor,
      run: async () => ({
        rig: { bones: [], origin: 'local' },
        bindings: [],
        metadata: { backendId: 'test', sourceInfluences: 4, outputInfluences: 4, fingers: false },
      }),
    }

    expect(() => new AutoRigService([backend, backend])).toThrow('Duplicate Auto Rig backend')
  })

  it('discards a result that arrives after cancellation', async () => {
    const controller = new AbortController()
    const backend: AutoRigBackend<string> = {
      ...descriptor,
      run: async () => {
        controller.abort()
        return result
      },
    }
    const service = new AutoRigService([backend])

    await expect(
      service.run('test', 'mesh', {
        signal: controller.signal,
        onProgress: vi.fn(),
        targets: [{ mesh: 0, primitive: 0, vertexCount: 1 }],
      }),
    ).rejects.toThrow('CANCELLED')
  })

  it('refuses a backend result that does not cover the source primitives exactly', async () => {
    const backend: AutoRigBackend<string> = { ...descriptor, run: async () => result }
    const service = new AutoRigService([backend])

    await expect(
      service.run('test', 'mesh', {
        signal: new AbortController().signal,
        onProgress: vi.fn(),
        targets: [{ mesh: 1, primitive: 0, vertexCount: 10 }],
      }),
    ).rejects.toThrow('invalid-binding-target')
  })

  it('refuses a binding whose vertex count differs from its source primitive', async () => {
    const backend: AutoRigBackend<string> = { ...descriptor, run: async () => result }
    const service = new AutoRigService([backend])

    await expect(
      service.run('test', 'mesh', {
        signal: new AbortController().signal,
        onProgress: vi.fn(),
        targets: [{ mesh: 0, primitive: 0, vertexCount: 2 }],
      }),
    ).rejects.toThrow('invalid-binding-size')
  })

  it('refuses an empty binding result', async () => {
    const backend: AutoRigBackend<string> = {
      ...descriptor,
      run: async () => ({ ...result, bindings: [] }),
    }
    const service = new AutoRigService([backend])

    await expect(
      service.run('test', 'mesh', {
        signal: new AbortController().signal,
        onProgress: vi.fn(),
        targets: [{ mesh: 0, primitive: 0, vertexCount: 1 }],
      }),
    ).rejects.toThrow('invalid-binding-size')
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

    await backend.run('mesh', {
      signal,
      onProgress: progress,
      targets: [{ mesh: 0, primitive: 0, vertexCount: 1 }],
    })

    expect(infer).toHaveBeenCalledWith('mesh', signal)
    expect(progress.mock.calls).toEqual([[0], [1]])
  })
})
