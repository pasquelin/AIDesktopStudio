import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RELIEF_CHUNK_TEXELS,
  applyReliefSculpt,
  changedChunks,
  type ReliefSculpt,
} from '@shared/domain/relief'
import {
  DEFAULT_RELIEF_ELEVATION,
  DEFAULT_RELIEF_ORIGIN,
  DEFAULT_RELIEF_SIZE,
} from '@shared/domain/scene'
import type { ReliefSculptRequest, ReliefSculptResponse } from './reliefSculptMessage'

const posted: unknown[][] = []

beforeAll(async () => {
  vi.spyOn(self, 'postMessage').mockImplementation((...args: unknown[]) => {
    posted.push(args)
  })
  await import('./reliefSculpt.worker')
})

beforeEach(() => {
  posted.length = 0
})

const samples = { width: 66, height: 8, values: new Float32Array(66 * 8) }
const extent = {
  origin: DEFAULT_RELIEF_ORIGIN,
  size: DEFAULT_RELIEF_SIZE,
  elevation: DEFAULT_RELIEF_ELEVATION,
}
const stepX = extent.size.x / (samples.width - 1)
const disk = {
  x: extent.origin.x + 64 * stepX,
  z: extent.origin.z,
  radius: stepX * 2,
}

function ask(id: number, sculpt: ReliefSculpt | undefined = undefined): void {
  const data: ReliefSculptRequest = {
    id,
    width: samples.width,
    height: samples.height,
    extent,
    grain: RELIEF_CHUNK_TEXELS,
    sculpt,
    operation: { kind: 'raiseDisk', disk, amount: 3 },
  }
  self.dispatchEvent(new MessageEvent('message', { data }))
}

function packedOf(response: Extract<ReliefSculptResponse, { ok: true }>): ReliefSculpt {
  return { chunks: response.chunks }
}

describe('the relief sculpt worker', () => {
  it('answers the same deltas as applyReliefSculpt on this thread', () => {
    ask(4)

    const message = posted[0]?.[0] as ReliefSculptResponse
    expect(message).toMatchObject({ id: 4, ok: true })
    if (!message || !message.ok) throw new Error('worker did not answer')

    const direct = applyReliefSculpt(samples, extent, undefined, {
      kind: 'raiseDisk',
      disk,
      amount: 3,
    })
    expect(packedOf(message).chunks).toEqual(changedChunks(undefined, direct))
  })

  /** In the form the DOCUMENT holds: nothing is left for the UI thread to encode on arrival. */
  it('answers packed chunks, and nothing to transfer beside them', () => {
    ask(5)

    const message = posted[0]?.[0] as ReliefSculptResponse
    if (!message || !message.ok) throw new Error('worker did not answer')
    expect(message.chunks.length).toBeGreaterThan(0)
    expect(message.chunks.every(chunk => typeof chunk.payload === 'string')).toBe(true)
    expect(posted[0]?.[1]).toBeUndefined()
  })

  it('flattens from the values on the request, matching applyReliefSculpt on this thread', () => {
    const peaked = {
      width: samples.width,
      height: samples.height,
      values: Float32Array.from({ length: samples.width * samples.height }, (_, at) =>
        at === 64 ? 1 : 0,
      ),
    }
    const data: ReliefSculptRequest = {
      id: 6,
      width: peaked.width,
      height: peaked.height,
      extent,
      grain: RELIEF_CHUNK_TEXELS,
      sculpt: undefined,
      operation: { kind: 'flatten', disk, amount: 1, target: 0.4 },
      baseId: 1,
      values: peaked.values,
    }
    self.dispatchEvent(new MessageEvent('message', { data }))

    const message = posted[0]?.[0] as ReliefSculptResponse
    if (!message || !message.ok) throw new Error('worker did not answer')
    const direct = applyReliefSculpt(peaked, extent, undefined, data.operation)
    expect(packedOf(message).chunks).toEqual(changedChunks(undefined, direct))
  })

  it('reuses a bound heightfield without receiving its values again', () => {
    const peaked = {
      width: samples.width,
      height: samples.height,
      values: new Float32Array(samples.width * samples.height).fill(0.75),
    }
    const bind: ReliefSculptRequest = {
      id: 7,
      width: peaked.width,
      height: peaked.height,
      extent,
      grain: RELIEF_CHUNK_TEXELS,
      sculpt: undefined,
      operation: { kind: 'smooth', disk, amount: 0.5, falloff: 0 },
      baseId: 2,
      values: peaked.values,
    }
    self.dispatchEvent(new MessageEvent('message', { data: bind }))
    const reuse: ReliefSculptRequest = { ...bind, id: 8, values: undefined }
    self.dispatchEvent(new MessageEvent('message', { data: reuse }))

    const message = posted[1]?.[0] as ReliefSculptResponse
    if (!message || !message.ok) throw new Error('worker did not reuse its base')
    const direct = applyReliefSculpt(peaked, extent, undefined, reuse.operation)
    expect(packedOf(message).chunks).toEqual(changedChunks(undefined, direct))
  })
})
