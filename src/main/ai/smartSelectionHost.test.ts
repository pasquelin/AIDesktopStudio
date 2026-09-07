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
    const job = vi.fn<PythonClient['job']>(async op => ({
      v: 1,
      evt: 'job.completed',
      job: op,
      ...(op === 'selection.decode' ? { width: 2, height: 2, alpha: '00ff00ff' } : {}),
    }))
    const ensureLoaded = vi.fn()
    const host = createSmartSelectionHost({
      ensureLoaded,
      hold: () => vi.fn(),
      engine: () => Promise.resolve(engine(job)),
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

  // 🛑 An idle unload, or another model taking the room: the engine let its embedding go while
  // only the studio still believed in one, and the click answered a failure nobody can act on.
  it('encodes again when the engine says it no longer holds the embedding', async () => {
    let decodes = 0
    const job = vi.fn<PythonClient['job']>(async op => {
      if (op === 'selection.decode') {
        decodes += 1
        if (decodes === 1) throw new Error('EfficientSAM has no embedding')
      }
      return {
        v: 1,
        evt: 'job.completed',
        job: op,
        ...(op === 'selection.decode' ? { width: 2, height: 2, alpha: '00ff00ff' } : {}),
      }
    })
    const host = createSmartSelectionHost({
      ensureLoaded: vi.fn(),
      hold: () => vi.fn(),
      engine: () => Promise.resolve(engine(job)),
    })

    const mask = await host.run(request, new AbortController().signal)

    expect(mask.width).toBe(2)
    expect(job.mock.calls.filter(([op]) => op === 'selection.encode')).toHaveLength(2)
  })

  it('does not start a queued request that was cancelled while waiting', async () => {
    const job = vi.fn<PythonClient['job']>(async op => ({
      v: 1,
      evt: 'job.completed',
      job: op,
      ...(op === 'selection.decode' ? { width: 2, height: 2, alpha: '00ff00ff' } : {}),
    }))
    const host = createSmartSelectionHost({
      ensureLoaded: vi.fn(),
      hold: () => vi.fn(),
      engine: () => Promise.resolve(engine(job)),
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
})
