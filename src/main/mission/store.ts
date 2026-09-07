import type { Mission, MissionId } from '@shared/domain/mission'
import type { MissionJournal } from './journal'
import { writeQueue } from '@main/persistence'

export type MissionStore = {
  list: () => Promise<readonly Mission[]>
  read: (id: MissionId) => Promise<Mission | null>
  save: (mission: Mission) => Promise<void>
  update: (
    id: MissionId,
    expectedRevision: number,
    change: (mission: Mission) => Mission,
  ) => Promise<Mission>
  subscribe: (listener: (mission: Mission) => void) => () => void
  flush: () => Promise<void>
}

export function createMissionStore(
  journal: MissionJournal,
  onListenerError: (error: unknown, mission: Mission) => void = () => {},
): MissionStore {
  const missions = new Map<MissionId, Mission>()
  const listeners = new Set<(mission: Mission) => void>()
  const commits = writeQueue()
  const opened = (async (): Promise<void> => {
    for (const mission of await journal.read()) missions.set(mission.id, mission)
  })()
  const publish = (mission: Mission): void => {
    for (const listener of listeners) {
      try {
        listener(mission)
      } catch (error) {
        onListenerError(error, mission)
      }
    }
  }

  return {
    list: async () => {
      await opened
      return [...missions.values()]
    },
    read: async id => {
      await opened
      return missions.get(id) ?? null
    },
    save: mission =>
      commits.next(async () => {
        await opened
        await journal.append(mission)
        missions.set(mission.id, mission)
        publish(mission)
      }),
    update: (id, expectedRevision, change) =>
      commits.next(async () => {
        await opened
        const current = missions.get(id)
        if (!current) throw new Error(`mission ${id} does not exist`)
        if (current.revision !== expectedRevision) throw new Error(`mission ${id} changed`)
        const changed = change(current)
        if (changed.id !== id) throw new Error('mission update changed its identity')
        const next = { ...changed, revision: current.revision + 1 }
        await journal.append(next)
        missions.set(id, next)
        publish(next)
        return next
      }),
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    flush: async () => {
      await commits.settled()
      await journal.flush()
    },
  }
}
