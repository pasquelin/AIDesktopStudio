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

describe('which language model is asked for', () => {
  /**
   * 🛑 Three of the four models this studio declares had already left the schema's list, and the
   * call was refused with nothing on screen saying why.
   */
  it('asks the schema’s own default where the chosen model has left the list', async () => {
    const run = vi.fn((_body: Record<string, unknown>) => Promise.resolve(succeeded()))
    const brain = createProviderBrain({
      limits: reading(),
      run,
      readText: () => Promise.resolve('{"say":"ok","calls":[]}'),
      model: () => 'claude-opus-4-8',
    })

    await brain.think({ utterance: 'hello', history: [] })

    expect(run.mock.calls[0]?.[0]?.['model']).toBe('gemini-3.5-flash-lite')
  })

  it('leaves the choice alone where the schema still lists it', async () => {
    const run = vi.fn((_body: Record<string, unknown>) => Promise.resolve(succeeded()))
    const brain = createProviderBrain({
      limits: reading(),
      run,
      readText: () => Promise.resolve('{"say":"ok","calls":[]}'),
      model: () => 'claude-haiku-4-5',
    })

    await brain.think({ utterance: 'hello', history: [] })

    expect(run.mock.calls[0]?.[0]?.['model']).toBe('claude-haiku-4-5')
  })
})
