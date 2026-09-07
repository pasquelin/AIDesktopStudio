import { describe, expect, it, vi } from 'vitest'
import {
  addMissionStep,
  createMission,
  createMissionStep,
  type Mission,
  type MissionClock,
} from '@shared/domain/mission'
import type { MissionJournal } from './journal'
import { createMissionManager } from './manager'
import { createMissionStore } from './store'
import { createStudioEventBus } from './eventBus'

function clock(): MissionClock {
  let id = 0
  return { now: () => '2026-09-04T10:00:00.000Z', newId: () => String(++id) }
}

function journalWith(missions: readonly Mission[]): MissionJournal {
  return { read: async () => missions, append: vi.fn(), flush: vi.fn() }
}

const managerWith = (journal: MissionJournal, time: MissionClock) =>
  createMissionManager(createMissionStore(journal), createStudioEventBus(), time)

describe('mission manager', () => {
  it('restores missions before answering its first projection', async () => {
    const time = clock()
    const stored = { ...createMission('Stored', time), projectId: 'project_a' }
    const manager = managerWith(journalWith([stored]), time)

    expect(await manager.list({ projectId: 'project_a' })).toEqual([stored])
    expect(await manager.list({ projectId: 'project_b' })).toEqual([])
  })

  it('persists a mission before publishing it to observers', async () => {
    const time = clock()
    const journal = journalWith([])
    const events = createStudioEventBus()
    const manager = createMissionManager(createMissionStore(journal), events, time)
    const seen: Mission[] = []
    const eventIds: string[] = []
    manager.subscribe(mission => seen.push(mission))
    events.subscribe({}, event => eventIds.push(event.missionId ?? ''))

    const mission = await manager.create('Create a scene', { projectId: 'project_a' })

    expect(journal.append).toHaveBeenCalledWith(mission)
    expect(seen).toEqual([mission])
    expect(eventIds).toEqual([mission.id])
  })

  it('refuses a stale concurrent update', async () => {
    const time = clock()
    const manager = managerWith(journalWith([]), time)
    const mission = await manager.create('Create a scene', {})

    await expect(
      manager.update(mission.id, mission.revision + 1, current => ({
        ...current,
        goal: 'Overwrite',
      })),
    ).rejects.toThrow(`mission ${mission.id} changed`)
  })

  it('publishes typed step events beside mission state changes', async () => {
    const time = clock()
    const events = createStudioEventBus()
    const manager = createMissionManager(createMissionStore(journalWith([])), events, time)
    const types: string[] = []
    events.subscribe({}, event => types.push(event.type))
    const mission = await manager.create('Generate', {})
    const step = createMissionStep(
      mission.id,
      'Start generation',
      { kind: 'job', jobId: 'job_1' },
      time,
    )

    await manager.update(mission.id, mission.revision, current =>
      addMissionStep(current, step, time.now()),
    )

    expect(types).toContain('mission.step.job')
  })
})
