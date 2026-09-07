import { describe, expect, it, vi } from 'vitest'

import type { Job } from '@shared/domain/job'

import { createProviderBrain } from './brainProvider'

import { type ProviderLimits } from './providerLimits'

/**
 * What `GET /models/model_scenario-llm` answers, `[M]` 2026-08-30 against the real account: the
 * `instruction` field takes 100 000 CHARACTERS, ten times what this file used to declare.
 */
export const SCHEMA: ProviderLimits = {
  instructionMax: 100_000,
  models: ['claude-haiku-4-5', 'gemini-3.5-flash-lite'],
  defaultModel: 'gemini-3.5-flash-lite',
  assumed: false,
}

export const reading =
  (limits: ProviderLimits = SCHEMA) =>
  () =>
    Promise.resolve(limits)

export const succeeded = (assetIds: string[] = ['asset_reply'], cost = 0.75): Job => ({
  id: 'job_1',
  targetId: 'model_scenario-llm',
  label: 'Assistant',
  status: 'succeeded',
  progress: 1,
  createdAt: '2026-08-15T10:00:00.000Z',
  assetIds,
  cost,
})

/**
 * 🛑 This door answers through a JOB, which is BILLED and outlives the ask: the stop reaches it
 * only if the signal travels all the way down to `JobManager.run`, which cancels by id.
 */
describe('stopping a turn on the Scenario door', () => {
  it('hands the job the signal that ends it', async () => {
    const run = vi.fn((_body: Record<string, unknown>, _signal?: AbortSignal) =>
      Promise.resolve(succeeded()),
    )
    const brain = createProviderBrain({
      limits: reading(),
      run,
      readText: () => Promise.resolve('{"say":"ok","calls":[]}'),
      model: () => 'claude-haiku-4-5',
    })
    const stopping = new AbortController()

    await brain.think({ utterance: 'hello', history: [] }, { signal: stopping.signal })

    expect(run.mock.calls[0]?.[1]).toBe(stopping.signal)
  })

  /**
   * 🛑 A cancelled job answers no text, and an empty answer is UNREADABLE — so the turn asked the
   * door a SECOND time, billing a second job for a sentence nobody was waiting for, and the
   * window then called the turn lost rather than stopped.
   */
  it('asks nothing more once the job came back cancelled', async () => {
    const cancelled: Job = { ...succeeded(), status: 'cancelled' }
    const run = vi.fn((_body: Record<string, unknown>, _signal?: AbortSignal) =>
      Promise.resolve(cancelled),
    )
    const brain = createProviderBrain({
      limits: reading(),
      run,
      readText: () => Promise.resolve(''),
      model: () => 'claude-haiku-4-5',
    })

    await expect(brain.think({ utterance: 'hello', history: [] })).rejects.toThrow()
    expect(run).toHaveBeenCalledTimes(1)
  })
})
