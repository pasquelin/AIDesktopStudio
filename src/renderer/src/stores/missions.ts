import { create } from 'zustand'
import type { Mission } from '@shared/domain/mission'
import type { MissionScope } from '@shared/studioBridgeMissions'
import { getBridge } from '@/services/bridge'
import { studioEventsForMission } from '@shared/domain/studioEvent'
import type { StudioEvent } from '@shared/domain/studioEvent'

type MissionsState = {
  missions: readonly Mission[]
  events: readonly StudioEvent[]
  connectMissions: (scope: MissionScope) => Promise<() => void>
  disconnectMissions: () => void
  createMission: (goal: string) => Promise<void>
}

function missionEvents(missions: readonly Mission[]): readonly StudioEvent[] {
  let sequence = 0
  return missions.flatMap(mission =>
    studioEventsForMission(mission, null, {
      now: () => mission.updatedAt,
      newId: () => `${mission.id}_${sequence++}`,
    }),
  )
}

function mergedEvents(
  seed: readonly StudioEvent[],
  live: readonly StudioEvent[],
): readonly StudioEvent[] {
  return [...new Map([...seed, ...live].map(event => [event.id, event])).values()].slice(-200)
}

export const useMissions = create<MissionsState>()((set, get) => {
  let activeConnection = 0
  let activeScope: MissionScope | undefined
  let activeStop = (): void => {}
  const disconnectMissions = (): void => {
    activeConnection += 1
    activeScope = undefined
    activeStop()
    activeStop = () => {}
  }
  return {
    missions: [],
    events: [],
    connectMissions: async scope => {
      activeStop()
      activeStop = () => {}
      const connection = ++activeConnection
      activeScope = scope
      const bridge = getBridge()
      if (!bridge) return () => {}
      const belongsToScope = (mission: Mission): boolean => mission.projectId === scope.projectId
      const pushed = new Map<string, Mission>()
      const liveEvents: StudioEvent[] = []
      const unsubscribe = bridge.missions.onChanged(changed => {
        if (connection !== activeConnection || !belongsToScope(changed)) return
        pushed.set(changed.id, changed)
        set(state => {
          const missions = [...state.missions.filter(mission => mission.id !== changed.id), changed]
          return { missions }
        })
      })
      const unsubscribeEvents = bridge.missions.onEvent(event => {
        if (connection !== activeConnection) return
        liveEvents.push(event)
        set(state => ({ events: [...state.events.slice(-199), event] }))
      })
      let stopped = false
      const stop = (): void => {
        if (stopped) return
        stopped = true
        unsubscribe()
        unsubscribeEvents()
      }
      activeStop = stop
      const missions = await bridge.missions.watch(scope)
      if (connection === activeConnection) {
        const projected = [
          ...missions.filter(mission => belongsToScope(mission) && !pushed.has(mission.id)),
          ...pushed.values(),
        ]
        set({ missions: projected, events: mergedEvents(missionEvents(projected), liveEvents) })
      }
      return () => {
        if (connection === activeConnection) disconnectMissions()
        else stop()
      }
    },
    disconnectMissions,
    createMission: async goal => {
      const bridge = getBridge()
      const connection = activeConnection
      const scope = activeScope
      if (!bridge || !scope) return
      const created = await bridge.missions.create(goal)
      if (
        connection === activeConnection &&
        created.projectId === scope.projectId &&
        !get().missions.some(mission => mission.id === created.id)
      ) {
        set(state => {
          const missions = [...state.missions, created]
          return { missions }
        })
      }
    },
  }
})
