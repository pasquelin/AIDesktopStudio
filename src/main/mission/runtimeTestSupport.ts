import { vi } from 'vitest'
import type { AssistantAnswer, AssistantThought } from '@shared/domain/assistant'
import type { Mission, MissionClock } from '@shared/domain/mission'
import { actionCorpus } from '@main/actionIndex/actionCorpus'
import type { AssistantBrain } from '@main/assistant/brainPort'
import type { AssistantContext } from './context'
import { emptyBudgetReport } from './contextBudget'
import { createStudioEventBus } from './eventBus'
import type { MissionJournal } from './journal'
import { createMissionManager, type MissionManager } from './manager'
import { createMissionRuntime, type MissionRuntime } from './runtime'
import { createMissionStore } from './store'

export function missionTestClock(): MissionClock {
  let id = 0
  return { now: () => '2026-09-04T10:00:00.000Z', newId: () => String(++id) }
}

export const missionTestContext = (mission: Mission): AssistantContext => {
  const action = actionCorpus().actions.find(candidate => candidate.name === 'project.create')
  if (!action) throw new Error('project.create is missing')
  return {
    mission: {
      id: mission.id,
      goal: mission.goal,
      state: mission.state,
      revision: mission.revision,
      step: {
        id: mission.plan.steps[0]?.id ?? '',
        title: mission.plan.steps[0]?.title ?? '',
        kind: mission.plan.steps[0]?.kind ?? 'reason',
        state: mission.plan.steps[0]?.state ?? 'pending',
        dependsOn: [],
      },
      request: mission.goal,
    },
    workspace: null,
    project: null,
    actions: [
      {
        action,
        score: 1,
        lexicalScore: 1,
        relevanceScore: 1,
        applicabilityScore: 0,
        documentAffinity: 'transversal',
      },
    ],
    memories: [],
    jobs: [],
    previousResults: mission.plan.steps
      .filter(step => step.kind === 'action' && step.state === 'completed')
      .map(step => ({ stepId: step.id, title: step.title, result: step.result })),
    budget: emptyBudgetReport(),
  }
}

export function missionTestRuntime(
  brain: AssistantBrain,
  over: Partial<Parameters<typeof createMissionRuntime>[0]> = {},
): { runtime: MissionRuntime; manager: MissionManager } {
  const time = missionTestClock()
  const journal: MissionJournal = { read: async () => [], append: vi.fn(), flush: vi.fn() }
  const manager = createMissionManager(createMissionStore(journal), createStudioEventBus(), time)
  const runtime = createMissionRuntime({
    manager,
    context: { build: async ({ mission }) => missionTestContext(mission) },
    brain,
    actions: { run: async () => ({ ok: true }), settle: vi.fn() },
    jobs: { list: () => [] },
    revisions: { read: async () => ({ current: [], unavailable: [] }) },
    clock: time,
    ...over,
  })
  return { runtime, manager }
}

export function missionTestBrain(
  answers: readonly AssistantAnswer[],
  multimodalImages = false,
): { brain: AssistantBrain; requests: AssistantThought[] } {
  const queued = [...answers]
  const requests: AssistantThought[] = []
  return {
    requests,
    brain: {
      capabilities: async () => ({
        streaming: false,
        structuredJson: true,
        multimodalImages,
      }),
      think: async request => {
        requests.push(request)
        const answer = queued.shift()
        if (!answer) throw new Error('unexpected reasoning turn')
        return answer
      },
      window: async () => null,
    },
  }
}
