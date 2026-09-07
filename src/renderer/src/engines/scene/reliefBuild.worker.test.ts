import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_RELIEF_ELEVATION,
  DEFAULT_RELIEF_ORIGIN,
  DEFAULT_RELIEF_SIZE,
} from '@shared/domain/scene'
import type { ReliefBuildRequest, ReliefBuildResponse } from './reliefBuildMessage'

const posted: { message: ReliefBuildResponse; transfer?: StructuredSerializeOptions }[] = []

beforeAll(async () => {
  vi.spyOn(self, 'postMessage').mockImplementation(
    (message: ReliefBuildResponse, transfer?: StructuredSerializeOptions) => {
      posted.push({ message, transfer })
    },
  )
  await import('./reliefBuild.worker')
})

beforeEach(() => {
  posted.length = 0
})

function request(id: number): ReliefBuildRequest {
  return {
    id,
    width: 4,
    height: 4,
    values: Float32Array.from({ length: 16 }, (_, at) => at / 16),
    extent: {
      origin: DEFAULT_RELIEF_ORIGIN,
      size: DEFAULT_RELIEF_SIZE,
      elevation: DEFAULT_RELIEF_ELEVATION,
    },
    grain: 2,
    edits: [],
  }
}

async function drain(): Promise<void> {
  for (let turn = 0; turn < 6; turn++) await new Promise(resolve => setTimeout(resolve, 0))
}

describe('the relief geometry worker', () => {
  it('reports progress and transfers every completed geometry buffer', async () => {
    self.dispatchEvent(new MessageEvent('message', { data: request(1) }))
    await drain()

    const responses = posted.map(call => call.message)
    const answer = responses.find(response => response.done)
    if (!answer?.done || !answer.ok) throw new Error('the worker did not answer with geometry')

    expect(responses.some(response => !response.done)).toBe(true)
    expect(answer.chunks).toHaveLength(4)
    expect(posted.find(call => call.message === answer)?.transfer?.transfer).toHaveLength(
      answer.chunks.length * 4,
    )
  })

  it('stops between rows when the build is taken back', async () => {
    self.dispatchEvent(new MessageEvent('message', { data: request(2) }))
    self.dispatchEvent(new MessageEvent('message', { data: { id: 2, cancel: true } }))
    await drain()

    expect(posted.map(call => call.message).some(response => response.done)).toBe(false)
  })
})
