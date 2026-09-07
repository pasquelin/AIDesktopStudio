import {
  createMission,
  type Mission,
  type MissionClock,
  type MissionId,
} from '@shared/domain/mission'
import { studioEventsForMission } from '@shared/domain/studioEvent'
import type { StudioEventBus } from './eventBus'
import type { MissionStore } from './store'

export type MissionScope = { readonly projectId?: string }
export type MissionManager = {
  list: (scope: MissionScope) => Promise<readonly Mission[]>
  read: (id: MissionId) => Promise<Mission | null>
  create: (goal: string, scope: MissionScope) => Promise<Mission>
  update: (
    id: MissionId,
    expectedRevision: number,
    change: (mission: Mission) => Mission,
  ) => Promise<Mission>
  subscribe: (listener: (mission: Mission) => void) => () => void
  flush: () => Promise<void>
}

const inScope = (mission: Mission, scope: MissionScope): boolean =>
  scope.projectId === undefined
    ? mission.projectId === undefined
    : mission.projectId === scope.projectId

export function createMissionManager(
  store: MissionStore,
  events: StudioEventBus,
  clock: MissionClock,
): MissionManager {
  const save = async (mission: Mission, previous: Mission | null = null): Promise<Mission> => {
    await store.save(mission)
    for (const event of studioEventsForMission(mission, previous, clock)) events.publish(event)
    return mission
  }

  return {
    list: async scope => (await store.list()).filter(mission => inScope(mission, scope)),
    read: store.read,
    create: async (goal, scope) =>
      await save({
        ...createMission(goal, clock),
        ...(scope.projectId === undefined ? {} : { projectId: scope.projectId }),
      }),
    update: async (id, expectedRevision, change) => {
      const previous = await store.read(id)
      const next = await store.update(id, expectedRevision, change)
      for (const event of studioEventsForMission(next, previous, clock)) events.publish(event)
      return next
    },
    subscribe: store.subscribe,
    flush: store.flush,
  }
}

export function missionBelongsToScope(mission: Mission, scope: MissionScope): boolean {
  return inScope(mission, scope)
}
