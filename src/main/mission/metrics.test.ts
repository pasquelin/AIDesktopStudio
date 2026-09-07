import { describe, expect, it } from 'vitest'
import { createMissionMetrics } from './metrics'
import { emptyBudgetReport } from './contextBudget'
import type { AssistantContext } from './context'

const context = (): AssistantContext => {
  const budget = emptyBudgetReport()
  budget.actions = { ...budget.actions, considered: 9, selected: 2 }
  budget.memories = { ...budget.memories, considered: 4, selected: 1 }
  return {
    mission: {
      id: 'mission_1',
      goal: 'Create',
      state: 'running',
      revision: 1,
      step: {
        id: 'step_1',
        title: 'Plan',
        kind: 'reason',
        state: 'running',
        dependsOn: [],
      },
      request: 'Create',
    },
    workspace: null,
    project: null,
    actions: [],
    memories: [],
    jobs: [],
    previousResults: [],
    visual: [
      {
        kind: 'viewport',
        mimeType: 'image/png',
        width: 1,
        height: 1,
        bytes: new Uint8Array(12),
        capturedAt: '2026-09-04T10:00:00.000Z',
      },
    ],
    budget,
  }
}

describe('mission runtime metrics', () => {
  it('measures disposable context and runtime work without retaining the context', () => {
    const metrics = createMissionMetrics()
    metrics.context(context(), 640)
    metrics.llmCall(true)
    metrics.llmCall(false)
    metrics.plannedSteps(3)
    metrics.revisionConflict()
    metrics.replan()
    metrics.wait('user')
    metrics.wait('job')
    metrics.concurrency(1)
    metrics.concurrency(3)

    expect(metrics.read()).toEqual({
      contextChars: 640,
      contextSources: 2,
      actionCandidates: 9,
      actionsSentToLlm: 0,
      memoryCandidates: 4,
      memoriesSentToLlm: 0,
      visualContextBytes: 12,
      missionSteps: 3,
      llmCalls: 2,
      planningCalls: 1,
      replans: 1,
      revisionConflicts: 1,
      userWaits: 1,
      jobWaits: 1,
      maximumConcurrentMissions: 3,
      actionIndexSearches: 1,
    })
  })
})
