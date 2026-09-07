// SPDX-License-Identifier: MIT

import type { GameEvent, GameEventName } from '@shared/domain/gameEvent'

/**
 * What a throwing handler is told to. Required rather than optional: a game whose event handler
 * fails silently is a game that appears to do nothing, and there is no console to notice it in.
 */
export type EventTrouble = (error: unknown, event: GameEvent) => void

/**
 * Typed, and DEFERRED: `emit` queues, `drain` delivers between two steps.
 *
 * 🛑 That is the whole point of it. `onCollision` destroying an entity while a system iterates
 * the store is the classic crash of every engine, and a queue makes it structurally impossible
 * rather than merely discouraged.
 */
export type EventBus = {
  on: (name: GameEventName, handler: (event: GameEvent) => void) => () => void
  /** Everything, whatever its name. What a SCRIPT needs: `onMessage` hears the whole bus. */
  onAny: (handler: (event: GameEvent) => void) => () => void
  emit: (event: GameEvent) => void
  /** Delivers what was queued. What a handler emits waits for the NEXT drain, never this one. */
  drain: () => void
  /** How many are waiting. What a report shows, and what a test asserts on. */
  pending: () => number
  /** Every subscription dropped — what STOP does, so nothing leaks into the next Play. */
  clear: () => void
}

export function createEventBus(report: EventTrouble): EventBus {
  const handlers = new Map<GameEventName, ((event: GameEvent) => void)[]>()
  const anyone: ((event: GameEvent) => void)[] = []
  // Two queues swapped rather than one drained in place: a handler emitting during a drain would
  // otherwise grow the array being walked, and the walk would never end.
  let queued: GameEvent[] = []
  let delivering: GameEvent[] = []
  // Reused rather than allocated per event — see the copy made in `drain`.
  const walking: ((event: GameEvent) => void)[] = []
  let stopped = false

  const deliver = (event: GameEvent): void => {
    const listed = handlers.get(event.name)
    if (!listed?.length && anyone.length === 0) return
    walking.length = 0
    if (listed) for (const handler of listed) walking.push(handler)
    for (const handler of anyone) walking.push(handler)
    for (let at = 0; at < walking.length && !stopped; at++) {
      try {
        walking[at]?.(event)
      } catch (error) {
        report(error, event)
      }
    }
  }

  return {
    on: (name, handler) => {
      const listed = handlers.get(name) ?? []
      listed.push(handler)
      handlers.set(name, listed)

      return () => {
        const at = listed.indexOf(handler)
        if (at >= 0) listed.splice(at, 1)
      }
    },

    onAny: handler => {
      anyone.push(handler)
      return () => {
        const at = anyone.indexOf(handler)
        if (at >= 0) anyone.splice(at, 1)
      }
    },

    emit: event => {
      queued.push(event)
    },

    drain: () => {
      const swapped = delivering
      delivering = queued
      queued = swapped
      stopped = false

      try {
        for (let index = 0; index < delivering.length && !stopped; index++) {
          const event = delivering[index]
          if (!event) continue
          deliver(event)
        }
      } finally {
        // In a `finally`, or a throw leaves the tick's events in the buffer that becomes the next
        // queue — and they are delivered a SECOND time, two drains late.
        delivering.length = 0
        walking.length = 0
      }
    },

    pending: () => queued.length,

    clear: () => {
      handlers.clear()
      anyone.length = 0
      queued.length = 0
      delivering.length = 0
      // A STOP raised by a handler stops the rest of the delivery too, rather than running the
      // handlers of a session that has just ended.
      stopped = true
    },
  }
}
