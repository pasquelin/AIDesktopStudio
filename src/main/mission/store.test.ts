import { describe, expect, it, vi } from 'vitest'
import { createMission, type MissionClock } from '@shared/domain/mission'
import type { MissionJournal } from './journal'
import { createMissionStore } from './store'

const time: MissionClock = { now: () => '2026-09-04T10:00:00.000Z', newId: () => '1' }

describe('mission store', () => {
  it('owns restored snapshots independently of the manager', async () => {
    const mission = createMission('Stored', time)
    const journal: MissionJournal = {
      read: async () => [mission],
      append: vi.fn(),
      flush: vi.fn(),
    }
    const store = createMissionStore(journal)

    expect(await store.read(mission.id)).toEqual(mission)
    expect(await store.list()).toEqual([mission])
  })

  it('publishes a snapshot only after the journal accepts it', async () => {
    const mission = createMission('Stored', time)
    const append = vi.fn(async () => undefined)
    const journal: MissionJournal = { read: async () => [], append, flush: vi.fn() }
    const store = createMissionStore(journal)
    const seen: string[] = []
    store.subscribe(saved => seen.push(saved.id))

    await store.save(mission)

    expect(append).toHaveBeenCalledWith(mission)
    expect(seen).toEqual([mission.id])
  })

  it('isolates a failing subscriber after a durable save', async () => {
    const mission = createMission('Stored', time)
    const onError = vi.fn()
    const journal: MissionJournal = { read: async () => [], append: vi.fn(), flush: vi.fn() }
    const store = createMissionStore(journal, onError)
    const seen: string[] = []
    store.subscribe(() => {
      throw new Error('closed window')
    })
    store.subscribe(saved => seen.push(saved.id))

    await expect(store.save(mission)).resolves.toBeUndefined()

    expect(onError).toHaveBeenCalledWith(expect.any(Error), mission)
    expect(seen).toEqual([mission.id])
  })

  it('flushes store commits before flushing the journal', async () => {
    const mission = createMission('Queued', time)
    let release = (): void => {}
    const blocked = new Promise<void>(resolve => {
      release = resolve
    })
    const append = vi.fn(async () => await blocked)
    const flush = vi.fn()
    const store = createMissionStore({ read: async () => [], append, flush })
    void store.save(mission)

    const settling = store.flush()
    await vi.waitFor(() => expect(append).toHaveBeenCalled())
    expect(flush).not.toHaveBeenCalled()
    release()
    await settling

    expect(flush).toHaveBeenCalledOnce()
  })

  it('serializes competing updates so only one stale writer wins', async () => {
    const mission = createMission('Stored', time)
    const journal: MissionJournal = { read: async () => [mission], append: vi.fn(), flush: vi.fn() }
    const store = createMissionStore(journal)

    const outcomes = await Promise.allSettled([
      store.update(mission.id, mission.revision, current => ({ ...current, updatedAt: 'same' })),
      store.update(mission.id, mission.revision, current => ({ ...current, updatedAt: 'same' })),
    ])

    expect(outcomes.map(outcome => outcome.status).sort()).toEqual(['fulfilled', 'rejected'])
  })

  it('preserves the identity of an updated mission', async () => {
    const mission = createMission('Stored', time)
    const journal: MissionJournal = { read: async () => [mission], append: vi.fn(), flush: vi.fn() }
    const store = createMissionStore(journal)

    await expect(
      store.update(mission.id, mission.revision, current => ({ ...current, id: 'mission_other' })),
    ).rejects.toThrow('mission update changed its identity')
  })
})
