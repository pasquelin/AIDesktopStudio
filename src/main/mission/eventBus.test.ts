import { describe, expect, it } from 'vitest'
import type { StudioEvent } from '@shared/domain/studioEvent'
import { createStudioEventBus } from './eventBus'

const event = (
  id: string,
  missionId: string,
  state: StudioEvent['state'] = 'running',
): StudioEvent => ({
  id,
  missionId,
  at: '2026-09-04T10:00:00.000Z',
  state,
  category: 'mission',
  type: 'mission.state.changed',
  priority: state === 'failed' ? 'important' : 'normal',
  messageKey: 'activity.missionStateChanged',
})

describe('studio event bus', () => {
  it('delivers correlated events in publication order and isolates mission scopes', () => {
    const bus = createStudioEventBus()
    const first: StudioEvent[] = []
    const second: StudioEvent[] = []
    bus.subscribe({ missionId: 'mission_1' }, item => first.push(item))
    bus.subscribe({ missionId: 'mission_2' }, item => second.push(item))

    bus.publish(event('event_1', 'mission_1'))
    bus.publish(event('event_2', 'mission_2', 'failed'))
    bus.publish(event('event_3', 'mission_1', 'completed'))

    expect(first.map(item => item.id)).toEqual(['event_1', 'event_3'])
    expect(second).toEqual([event('event_2', 'mission_2', 'failed')])
  })

  it('stops progress and failures after unsubscription', () => {
    const bus = createStudioEventBus()
    const seen: StudioEvent[] = []
    const stop = bus.subscribe({}, item => seen.push(item))
    bus.publish({
      ...event('event_1', 'mission_1'),
      progress: { current: 1, total: 2, ratio: 0.5 },
    })
    stop()
    bus.publish(event('event_2', 'mission_1', 'failed'))

    expect(seen).toHaveLength(1)
    expect(seen[0]?.progress).toEqual({ current: 1, total: 2, ratio: 0.5 })
  })

  it('continues after a failing subscriber without rejecting committed work', () => {
    const failures: unknown[] = []
    const bus = createStudioEventBus(error => failures.push(error))
    const seen: string[] = []
    bus.subscribe({}, () => {
      throw new Error('listener failed')
    })
    bus.subscribe({}, item => seen.push(item.id))

    bus.publish(event('event_1', 'mission_1'))

    expect(failures).toHaveLength(1)
    expect(seen).toEqual(['event_1'])
  })
})
