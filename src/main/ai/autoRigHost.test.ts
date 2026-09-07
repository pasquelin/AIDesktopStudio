import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import type { AutoRigInferenceRequest } from '@shared/domain/autoRigInference'
import { describe, expect, it, vi } from 'vitest'
import { shippedModel } from './catalogue'
import { createAutoRigHost, type AutoRigFailure } from './autoRigHost'
import type { PythonClient } from './pythonClient'

const MODEL = (() => {
  const model = shippedModel('make-it-animatable')
  if (!model) throw new Error('the Auto Rig catalogue fixture is missing')
  return model
})()

const request: AutoRigInferenceRequest = {
  id: 'rig-1',
  backendId: 'make-it-animatable',
  positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  triangles: Uint32Array.from([0, 1, 2]),
  primitives: [{ mesh: 0, primitive: 0, vertexOffset: 0, vertexCount: 3 }],
  options: { fingers: 'detailed', useSurfaceNormals: false, weightPostProcessing: true },
}

function engineThatWritesResult(
  files = { heads: 'heads.bin', tails: 'tails.bin', weights: 'weights.bin', pose: 'pose.bin' },
  symlinkWeight = false,
  backendId = request.backendId,
): PythonClient {
  return {
    ready: Promise.resolve({
      v: 1,
      evt: 'engine.hello',
      engine: 'test',
      protocol: 1,
      python: 'test',
      platform: 'test',
    }),
    hardware: () => Promise.reject(new Error('unused')),
    memory: () => Promise.resolve([]),
    requirements: () => Promise.reject(new Error('unused')),
    close: vi.fn(),
    job: async (_op, params, watch) => {
      const destination = params.destination
      if (typeof destination !== 'string') throw new Error('missing destination')
      await mkdir(destination)
      await Promise.all([
        writeFile(`${destination}/heads.bin`, Float32Array.from([0, 0, 0])),
        writeFile(`${destination}/tails.bin`, Float32Array.from([0, 1, 0])),
        symlinkWeight
          ? symlink('/etc/hosts', `${destination}/weights.bin`)
          : writeFile(`${destination}/weights.bin`, Float32Array.from([1, 1, 1])),
      ])
      await writeFile(
        `${destination}/result.json`,
        JSON.stringify({
          backendId,
          jointNames: ['Hips'],
          parents: [-1],
          vertices: 3,
          files,
        }),
      )
      watch?.onStep?.(0.5, 'skeleton')
      return { v: 1, evt: 'job.completed', job: 'rig', device: 'cpu', generateMs: 12 }
    },
  }
}

function host(installed = true, engine = engineThatWritesResult()) {
  return createAutoRigHost({
    models: () => [MODEL],
    installedIds: () => new Set(installed ? [MODEL.id] : []),
    ensureLoaded: vi.fn(),
    hold: () => vi.fn(),
    engine: () => Promise.resolve(engine),
  })
}

describe('AutoRigHost', () => {
  it('refuses a distribution-blocked backend even when its files are installed', async () => {
    const blocked = createAutoRigHost({
      models: () => [{ ...MODEL, distributionStatus: 'blocked' }],
      installedIds: () => new Set([MODEL.id]),
      ensureLoaded: vi.fn(),
      hold: () => vi.fn(),
      engine: () => Promise.resolve(engineThatWritesResult()),
    })

    await expect(blocked.run(request, new AbortController().signal, vi.fn())).rejects.toEqual(
      expect.objectContaining<Partial<AutoRigFailure>>({ code: 'ENGINE_UNAVAILABLE' }),
    )
  })
  it('runs a model-backed backend through the shared engine and returns neutral rig data', async () => {
    const progress = vi.fn()

    const result = await host().run(request, new AbortController().signal, progress)

    expect(result.jointNames).toEqual(['Hips'])
    expect([...result.weights]).toEqual([1, 1, 1])
    expect(result.primitives).toEqual(request.primitives)
    expect(result.device).toBe('cpu')
    expect(progress).toHaveBeenCalledWith(0.5, 'skeleton')
  })

  it('stages the selected quality options for the Python backend', async () => {
    const engine = engineThatWritesResult()
    const job = engine.job
    let staged: unknown
    engine.job = async (...arguments_) => {
      const source = arguments_[1].source
      if (typeof source !== 'string') throw new Error('missing source')
      staged = JSON.parse(await readFile(source, 'utf8'))
      return job(...arguments_)
    }

    await host(true, engine).run(request, new AbortController().signal, vi.fn())

    expect(staged).toMatchObject({ options: request.options })
  })

  it('refuses an unavailable model before starting the engine', async () => {
    await expect(host(false).run(request, new AbortController().signal, vi.fn())).rejects.toEqual(
      expect.objectContaining<Partial<AutoRigFailure>>({ code: 'MODEL_NOT_INSTALLED' }),
    )
  })

  it('returns cancellation without applying a partial result', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(host().run(request, controller.signal, vi.fn())).rejects.toEqual(
      expect.objectContaining<Partial<AutoRigFailure>>({ code: 'CANCELLED' }),
    )
  })

  it('maps a failed integrity check to the product error', async () => {
    const corrupt = createAutoRigHost({
      models: () => [MODEL],
      installedIds: () => new Set([MODEL.id]),
      ensureLoaded: () => Promise.reject(new Error('digest mismatch')),
      hold: () => vi.fn(),
      engine: () => Promise.resolve(null),
    })

    await expect(corrupt.run(request, new AbortController().signal, vi.fn())).rejects.toEqual(
      expect.objectContaining<Partial<AutoRigFailure>>({ code: 'MODEL_INVALID' }),
    )
  })

  it('refuses traversal and absolute result paths', async () => {
    for (const heads of ['../heads.bin', '/tmp/heads.bin']) {
      const engine = engineThatWritesResult({
        heads,
        tails: 'tails.bin',
        weights: 'weights.bin',
        pose: 'pose.bin',
      })
      await expect(
        host(true, engine).run(request, new AbortController().signal, vi.fn()),
      ).rejects.toThrow()
    }
  })

  it('refuses a result symlink without reading its target', async () => {
    await expect(
      host(true, engineThatWritesResult(undefined, true)).run(
        request,
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow()
  })

  it('refuses a result produced for another backend', async () => {
    await expect(
      host(true, engineThatWritesResult(undefined, false, 'other')).run(
        request,
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow()
  })

  it('rejects a late result after cancellation', async () => {
    const controller = new AbortController()
    const engine = engineThatWritesResult()
    const job = engine.job
    engine.job = async (...arguments_) => {
      const answer = await job(...arguments_)
      controller.abort()
      return answer
    }

    await expect(host(true, engine).run(request, controller.signal, vi.fn())).rejects.toEqual(
      expect.objectContaining<Partial<AutoRigFailure>>({ code: 'CANCELLED' }),
    )
  })
})
