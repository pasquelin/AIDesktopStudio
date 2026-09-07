import type { SmartSelectionRequest } from '@shared/domain/smartSelectionInference'
import { describe, expect, it, vi } from 'vitest'
import { createSmartSelectionHost } from './smartSelectionHost'
import type { PythonClient } from './pythonClient'

const request: SmartSelectionRequest = {
  id: 'd1eced4c-65d8-4dc7-b80f-2f43f4c90151',
  revision: 'document:1',
  png: Uint8Array.from([137, 80, 78, 71]),
  width: 2,
  height: 2,
  prompt: { point: { x: 1, y: 1 } },
}

/** BGRA, as `nativeImage` hands it back: four channels of the same grey per pixel. */
const bgra = (greys: readonly number[]): Uint8Array =>
  Uint8Array.from(greys.flatMap(grey => [grey, grey, grey, 255]))

const readBitmap = (): Promise<Uint8Array | null> => Promise.resolve(bgra([0, 255, 255, 0]))

/** What the door answers: the frame names the file the main process owns, and nothing more. */
const decoded = (op: string, params: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  op === 'selection.decode' ? { width: 2, height: 2, mask: params.destination } : {}

function engine(job: PythonClient['job']): PythonClient {
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
    job,
  }
}

describe('SmartSelectionHost', () => {
  it('reuses the embedding for a second prompt on the same composite revision', async () => {
    const job = vi.fn<PythonClient['job']>(async (op, params) => ({
      v: 1,
      evt: 'job.completed',
      job: op,
      ...decoded(op, params),
    }))
    const ensureLoaded = vi.fn()
    // The SAME client both times: the host re-encodes when the engine object changes, which a
    // fresh `engine(job)` per call would make it do.
    const python = engine(job)
    const host = createSmartSelectionHost({
      ensureLoaded,
      hold: () => vi.fn(),
      engine: () => Promise.resolve(python),
      epoch: () => 1,
      readBitmap,
    })

    await host.run(request, new AbortController().signal)
    await host.run(
      { ...request, id: '2fd0e5ff-6faf-4bd2-9a91-49bb1a2f22aa' },
      new AbortController().signal,
    )

    expect(job.mock.calls.filter(([op]) => op === 'selection.encode')).toHaveLength(1)
    expect(job.mock.calls.filter(([op]) => op === 'selection.decode')).toHaveLength(2)
    expect(ensureLoaded).toHaveBeenCalledTimes(2)
  })

  it('re-encodes a composite that the model reloaded', async () => {
    const job = vi.fn<PythonClient['job']>(async (op, params) => ({
      v: 1,
      evt: 'job.completed',
      job: op,
      ...decoded(op, params),
    }))
    let epoch = 1
    const host = createSmartSelectionHost({
      ensureLoaded: vi.fn(),
      hold: () => vi.fn(),
      engine: () => Promise.resolve(engine(job)),
      epoch: () => epoch,
      readBitmap,
    })

    await host.run(request, new AbortController().signal)
    epoch += 1
    await host.run(
      { ...request, id: '2fd0e5ff-6faf-4bdf-9a91-49bb1a2f22aa' },
      new AbortController().signal,
    )

    expect(job.mock.calls.filter(([op]) => op === 'selection.encode')).toHaveLength(2)
  })

  it('does not treat a reload during encoding as already encoded', async () => {
    let epoch = 1
    const job = vi.fn<PythonClient['job']>(async (op, params) => {
      if (op === 'selection.encode') epoch += 1
      return {
        v: 1,
        evt: 'job.completed',
        job: op,
        ...decoded(op, params),
      }
    })
    const host = createSmartSelectionHost({
      ensureLoaded: vi.fn(),
      hold: () => vi.fn(),
      engine: () => Promise.resolve(engine(job)),
      epoch: () => epoch,
      readBitmap,
    })

    await host.run(request, new AbortController().signal)
    await host.run(
      { ...request, id: '6d4a2a61-b0f0-4bc5-a4e6-02e18d1d4baf' },
      new AbortController().signal,
    )

    expect(job.mock.calls.filter(([op]) => op === 'selection.encode')).toHaveLength(2)
  })

  // 🛑 An idle unload, or another model taking the room: the engine let its embedding go while
  // only the studio still believed in one, and the click answered a failure nobody can act on.
  it('encodes again when the engine says it no longer holds the embedding', async () => {
    let decodes = 0
    const job = vi.fn<PythonClient['job']>(async (op, params) => {
      if (op === 'selection.decode') {
        decodes += 1
        if (decodes === 1) throw new Error('EfficientSAM has no embedding')
      }
      return {
        v: 1,
        evt: 'job.completed',
        job: op,
        ...decoded(op, params),
      }
    })
    const host = createSmartSelectionHost({
      ensureLoaded: vi.fn(),
      hold: () => vi.fn(),
      engine: () => Promise.resolve(engine(job)),
      epoch: () => 1,
      readBitmap,
    })

    const mask = await host.run(request, new AbortController().signal)

    expect(mask.width).toBe(2)
    expect(job.mock.calls.filter(([op]) => op === 'selection.encode')).toHaveLength(2)
  })

  it('does not start a queued request that was cancelled while waiting', async () => {
    const job = vi.fn<PythonClient['job']>(async (op, params) => ({
      v: 1,
      evt: 'job.completed',
      job: op,
      ...decoded(op, params),
    }))
    const host = createSmartSelectionHost({
      ensureLoaded: vi.fn(),
      hold: () => vi.fn(),
      engine: () => Promise.resolve(engine(job)),
      epoch: () => 1,
      readBitmap,
    })
    const cancelled = new AbortController()
    const first = host.run(request, new AbortController().signal)
    // 🛑 Queued BEFORE it is cancelled: aborting first would only measure the guard on the way
    // in, and a queue that started a dead request would stay green.
    const queued = host.run(
      { ...request, id: '2fd0e5ff-6faf-4bd2-9a91-49bb1a2f22aa' },
      cancelled.signal,
    )
    cancelled.abort()

    await first
    await expect(queued).rejects.toThrow()
    expect(job.mock.calls.filter(([op]) => op === 'selection.encode')).toHaveLength(1)
  })

  it('reads the mask out of the file the frame names, one grey channel per pixel', async () => {
    const job = vi.fn<PythonClient['job']>(async (op, params) => ({
      v: 1,
      evt: 'job.completed',
      job: op,
      ...decoded(op, params),
    }))
    const read = vi.fn(readBitmap)
    const host = createSmartSelectionHost({
      ensureLoaded: vi.fn(),
      hold: () => vi.fn(),
      engine: () => Promise.resolve(engine(job)),
      epoch: () => 1,
      readBitmap: read,
    })

    const mask = await host.run(request, new AbortController().signal)

    expect(mask.alpha).toEqual(Uint8Array.from([0, 255, 255, 0]))
    const asked = job.mock.calls.find(([op]) => op === 'selection.decode')?.[1].destination
    expect(read).toHaveBeenCalledWith(asked)
    expect(asked).toMatch(/mask\.png$/)
  })

  it('refuses a mask whose pixels do not fill the size the frame announces', async () => {
    const job = vi.fn<PythonClient['job']>(async (op, params) => ({
      v: 1,
      evt: 'job.completed',
      job: op,
      ...decoded(op, params),
    }))
    const host = createSmartSelectionHost({
      ensureLoaded: vi.fn(),
      hold: () => vi.fn(),
      engine: () => Promise.resolve(engine(job)),
      epoch: () => 1,
      readBitmap: () => Promise.resolve(bgra([0, 255])),
    })

    await expect(host.run(request, new AbortController().signal)).rejects.toThrow('invalid mask')
  })
})
