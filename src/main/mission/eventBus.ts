import type { StudioEvent } from '@shared/domain/studioEvent'

type StudioEventScope = { readonly missionId?: string }
export type StudioEventBus = {
  publish: (event: StudioEvent) => void
  subscribe: (scope: StudioEventScope, listener: (event: StudioEvent) => void) => () => void
}

export function createStudioEventBus(
  onListenerError: (error: unknown, event: StudioEvent) => void = () => {},
): StudioEventBus {
  const listeners = new Set<{
    readonly scope: StudioEventScope
    readonly listener: (event: StudioEvent) => void
  }>()
  return {
    publish: event => {
      for (const subscription of listeners) {
        if (
          subscription.scope.missionId === undefined ||
          subscription.scope.missionId === event.missionId
        ) {
          try {
            subscription.listener(event)
          } catch (error) {
            onListenerError(error, event)
          }
        }
      }
    },
    subscribe: (scope, listener) => {
      const subscription = { scope, listener }
      listeners.add(subscription)
      return () => listeners.delete(subscription)
    },
  }
}
