import { describe, expect, it, vi } from 'vitest'
import type { ActionOutcome, AssistantCall } from '@shared/domain/assistant'
import type { MissionJournal } from './journal'
import { createStudioEventBus } from './eventBus'
import { createMissionManager } from './manager'
import { createMissionRuntime } from './runtime'
import { createMissionStore } from './store'
import { missionTestBrain, missionTestClock, missionTestContext } from './runtimeTestSupport'

describe('mission runtime limits', () => {
  it('rejects an answer whose action batch would exceed the mission step limit', async () => {
    const clock = missionTestClock()
    const journal: MissionJournal = { read: async () => [], append: vi.fn(), flush: vi.fn() }
    const manager = createMissionManager(createMissionStore(journal), createStudioEventBus(), clock)
    const calls: AssistantCall[] = Array.from({ length: 48 }, () => ({
      action: 'project.create',
      input: {},
    }))
    const { brain } = missionTestBrain([{ say: '', calls, cost: 0 }])
    const run = vi.fn(async (): Promise<ActionOutcome> => ({ ok: true }))
    const runtime = createMissionRuntime({
      manager,
      context: { build: async ({ mission }) => missionTestContext(mission) },
      brain,
      actions: { run, settle: vi.fn() },
      jobs: { list: () => [] },
      revisions: { read: async () => ({ current: [], unavailable: [] }) },
      clock,
    })

    const mission = await runtime.create('Create many projects', {})

    expect(mission).toMatchObject({ state: 'failed' })
    expect(mission.plan.steps).toHaveLength(1)
    expect(mission.plan.steps[0]?.error).toBe('mission step limit reached')
    expect(run).not.toHaveBeenCalled()
  })
})
