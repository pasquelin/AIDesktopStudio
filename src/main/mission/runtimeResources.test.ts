import { describe, expect, it, vi } from 'vitest'
import type { ActionOutcome } from '@shared/domain/assistant'
import type { MissionJournal } from './journal'
import { createStudioEventBus } from './eventBus'
import { createMissionManager } from './manager'
import { createMissionRuntime } from './runtime'
import { createMissionStore } from './store'
import { missionTestBrain, missionTestClock, missionTestContext } from './runtimeTestSupport'

describe('mission runtime resources', () => {
  it('runs an action whose optional discovery resource is unavailable', async () => {
    const clock = missionTestClock()
    const journal: MissionJournal = { read: async () => [], append: vi.fn(), flush: vi.fn() }
    const manager = createMissionManager(createMissionStore(journal), createStudioEventBus(), clock)
    const { brain } = missionTestBrain([
      {
        say: '',
        calls: [{ action: 'file.open', input: { path: 'Images/Boat.png' } }],
        cost: 0,
      },
      { say: 'Done.', calls: [], cost: 0 },
    ])
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

    const mission = await runtime.create('Open Images/Boat.png', {})

    expect(mission.state).toBe('completed')
    expect(run).toHaveBeenCalledWith(
      { action: 'file.open', input: { path: 'Images/Boat.png' } },
      expect.any(AbortSignal),
    )
  })
})
