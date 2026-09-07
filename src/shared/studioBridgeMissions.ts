import type { Mission } from './domain/mission'
import type { StudioEvent } from './domain/studioEvent'
import type { Unsubscribe } from './ipcEvents'

export type MissionScope = { readonly projectId?: string }

export type StudioBridgeMissions = {
  missions: {
    watch: (scope: MissionScope) => Promise<readonly Mission[]>
    create: (goal: string) => Promise<Mission>
    resume: (stepId: string, answer: string) => Promise<Mission>
    onChanged: (callback: (mission: Mission) => void) => Unsubscribe
    onEvent: (callback: (event: StudioEvent) => void) => Unsubscribe
  }
}
