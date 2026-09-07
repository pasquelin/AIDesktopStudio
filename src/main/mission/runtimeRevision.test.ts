import { describe, expect, it, vi } from 'vitest'
import type { ActionOutcome, AssistantCall } from '@shared/domain/assistant'
import {
  addMissionStep,
  createMission,
  createMissionStep,
  transitionMission,
  transitionMissionStep,
  type Mission,
  type MissionClock,
} from '@shared/domain/mission'
import type { MissionJournal } from './journal'
import { createStudioEventBus } from './eventBus'
import { createMissionManager } from './manager'
import { createMissionRuntime } from './runtime'
import { createMissionStore } from './store'
import { missionTestBrain, missionTestClock, missionTestContext } from './runtimeTestSupport'

function interruptedMission(clock: MissionClock): Mission {
  let mission = createMission('Create the project', clock)
  const action = createMissionStep(
    mission.id,
    'project.create',
    { kind: 'action', call: { action: 'project.create', input: {} } },
    clock,
  )
  const verify = createMissionStep(mission.id, 'Verify mission result', { kind: 'verify' }, clock, [
    action.id,
  ])
  mission = addMissionStep(addMissionStep(mission, action, clock.now()), verify, clock.now())
  mission = transitionMission(
    transitionMission(transitionMission(mission, 'planning', clock.now()), 'ready', clock.now()),
    'running',
    clock.now(),
  )
  mission = transitionMissionStep(mission, action.id, 'ready', clock.now())
  return {
    ...mission,
    plan: {
      steps: mission.plan.steps.map(step =>
        step.id === action.id ? { ...step, startedAt: clock.now() } : step,
      ),
    },
    resourceRefs: [{ kind: 'document', id: 'document_1' }],
    revisionSnapshots: [
      {
        resource: { kind: 'document', id: 'document_1' },
        incarnation: 'window_1',
        revision: 1,
      },
    ],
  }
}

describe('mission runtime revision recovery', () => {
  it('reuses a pending verification after reconsidering an interrupted action', async () => {
    const clock = missionTestClock()
    const mission = interruptedMission(clock)
    const journal: MissionJournal = { read: async () => [mission], append: vi.fn(), flush: vi.fn() }
    const manager = createMissionManager(createMissionStore(journal), createStudioEventBus(), clock)
    const corrected: AssistantCall = { action: 'project.create', input: { name: 'Boat' } }
    const { brain, requests } = missionTestBrain([
      { say: '', calls: [corrected], cost: 0 },
      { say: 'Done.', calls: [], cost: 0 },
    ])
    const run = vi.fn(async (): Promise<ActionOutcome> => ({ ok: true }))
    const runtime = createMissionRuntime({
      manager,
      context: { build: async ({ mission: current }) => missionTestContext(current) },
      brain,
      actions: { run, settle: vi.fn() },
      jobs: { list: () => [] },
      revisions: {
        read: async () => ({
          current: [
            {
              resource: { kind: 'document', id: 'document_1' },
              incarnation: 'window_1',
              revision: 2,
            },
          ],
          unavailable: [],
        }),
      },
      clock,
    })

    await runtime.start()
    const completed = await manager.read(mission.id)

    expect(completed?.state).toBe('completed')
    expect(completed?.plan.steps.filter(step => step.kind === 'verify')).toHaveLength(1)
    expect(requests).toHaveLength(2)
    expect(run).toHaveBeenCalledWith(corrected, expect.any(AbortSignal))
  })

  /**
   * 🛑 A reconsidered action builds its context TWICE — once in `runAction`, once through `think`
   * — and the first build records the active document, moving the revision under the second.
   */
  it('records the active document once when reconsidering, rather than failing the mission', async () => {
    const clock = missionTestClock()
    const mission = { ...interruptedMission(clock), resourceRefs: [] }
    const journal: MissionJournal = { read: async () => [mission], append: vi.fn(), flush: vi.fn() }
    const manager = createMissionManager(createMissionStore(journal), createStudioEventBus(), clock)
    const { brain } = missionTestBrain([
      { say: '', calls: [{ action: 'project.create', input: {} }], cost: 0 },
      { say: 'Done.', calls: [], cost: 0 },
    ])
    const runtime = createMissionRuntime({
      manager,
      context: {
        build: async ({ mission: current }) => ({
          ...missionTestContext(current),
          document: {
            id: 'document_1',
            title: 'Scene',
            kind: 'scene',
            workspace: '3d',
            path: null,
            active: true,
            modified: false,
          },
        }),
      },
      brain,
      actions: { run: async (): Promise<ActionOutcome> => ({ ok: true }), settle: vi.fn() },
      jobs: { list: () => [] },
      revisions: {
        read: async () => ({
          current: [
            {
              resource: { kind: 'document', id: 'document_1' },
              incarnation: 'window_1',
              revision: 2,
            },
          ],
          unavailable: [],
        }),
      },
      clock,
    })

    await runtime.start()
    const after = await manager.read(mission.id)

    expect(after?.state).not.toBe('failed')
    expect(after?.resourceRefs).toEqual([{ kind: 'document', id: 'document_1' }])
  })
})
