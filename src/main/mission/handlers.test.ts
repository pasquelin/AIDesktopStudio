import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHANNELS, EVENTS } from '@shared/ipc'
import { closeWindow, invokeFrom, openWindow, resetHandlers } from '@main/ipc/testHarness'
import type { MissionClock } from '@shared/domain/mission'
import type { MissionJournal } from './journal'
import { createMissionManager } from './manager'
import { registerMissionHandlers } from './handlers'
import { createMissionStore } from './store'
import { createStudioEventBus } from './eventBus'

vi.mock('electron', async () => (await import('@main/ipc/testHarness')).mockElectron())

const time: MissionClock = {
  now: () => '2026-09-04T10:00:00.000Z',
  newId: vi.fn(() => '1'),
}

describe('mission handlers', () => {
  beforeEach(() => resetHandlers())

  it('projects a mission only into windows watching its project', async () => {
    const journal: MissionJournal = { read: async () => [], append: vi.fn(), flush: vi.fn() }
    registerMissionHandlers(
      createMissionManager(createMissionStore(journal), createStudioEventBus(), time),
    )
    const first = openWindow()
    const second = openWindow()
    await invokeFrom(first, CHANNELS.missionsWatch, { projectId: 'project_a' })
    await invokeFrom(second, CHANNELS.missionsWatch, { projectId: 'project_b' })

    await invokeFrom(first, CHANNELS.missionsCreate, 'Build')

    expect(first.sent).toMatchObject([{ channel: EVENTS.missionChanged }])
    expect(second.sent).toEqual([])
  })

  it('forgets a projection when its window closes', async () => {
    const journal: MissionJournal = { read: async () => [], append: vi.fn(), flush: vi.fn() }
    const manager = createMissionManager(createMissionStore(journal), createStudioEventBus(), time)
    registerMissionHandlers(manager)
    const window = openWindow()
    await invokeFrom(window, CHANNELS.missionsWatch, {})
    closeWindow(window)

    await manager.create('Detached', {})

    expect(window.sent).toEqual([])
  })
})
