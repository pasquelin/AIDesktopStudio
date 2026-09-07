import { describe, expect, it } from 'vitest'

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

describe('what this door says of its own bound', () => {
  /**
   * 🛑 In CHARACTERS, and never dressed as tokens: `instruction` is bounded by a length, and a
   * count of tokens shown against it would be an estimate beside a measurement.
   */
  it('names its window in the unit the schema names it in', async () => {
    const brain = createProviderBrain({
      limits: reading(),
      run: () => Promise.resolve(succeeded()),
      readText: () => Promise.resolve(''),
      model: () => 'claude-haiku-4-5',
    })

    expect(await brain.window()).toEqual({ size: 100_000, unit: 'characters', assumed: false })
  })

  /** A fallback that says so: the composer must not show it as something that was read. */
  it('marks a bound it could not read as an assumption', async () => {
    const brain = createProviderBrain({
      limits: reading({ instructionMax: 10_000, models: [], defaultModel: null, assumed: true }),
      run: () => Promise.resolve(succeeded()),
      readText: () => Promise.resolve(''),
      model: () => 'claude-haiku-4-5',
    })

    expect(await brain.window()).toMatchObject({ assumed: true })
  })

  /** What the person is spending, in the same unit as the bound it is spent against. */
  it('reports what the prompt carried, in characters', async () => {
    const frames: number[] = []
    const brain = createProviderBrain({
      limits: reading(),
      run: () => Promise.resolve(succeeded()),
      readText: () => Promise.resolve('{"say":"ok","calls":[]}'),
      model: () => 'claude-haiku-4-5',
    })

    await brain.think(
      { utterance: 'hello', history: [] },
      {
        onProgress: progress => {
          if (progress.promptChars !== undefined) frames.push(progress.promptChars)
        },
      },
    )

    expect(frames[0]).toBeGreaterThan(0)
  })
})
