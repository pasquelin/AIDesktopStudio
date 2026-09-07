import { expect, it } from 'vitest'

import { ACTION_REGISTRY } from '@shared/domain/assistant'

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
 * 🛑 `[M]` The room follows the bound the SCHEMA answers, and that is what makes the manuals
 * reachable: held to the 8 500 of the fallback, seven of forty printed and the other 33 were cut
 * in silence — `loaded` reported forty all the same, so nothing reopened them.
 */
it('takes its room from the bound the schema answers, not from the fallback', async () => {
  const sent: string[] = []
  const brain = createProviderBrain({
    limits: reading(),
    run: body => {
      sent.push(String(body['instruction']))
      return Promise.resolve(succeeded())
    },
    readText: () => Promise.resolve('{"say":"ok","calls":[]}'),
    model: () => 'claude-haiku-4-5',
  })

  await brain.think({
    utterance: 'anything',
    history: [],
    loaded: ACTION_REGISTRY.slice(0, 40).map(one => one.name),
  })

  const printed = ACTION_REGISTRY.slice(0, 40).filter(one =>
    (sent[0] ?? '').includes(`\n  ${one.name} — `),
  )
  expect(printed).toHaveLength(40)
})
