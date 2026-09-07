import type { WebContents } from 'electron'
import { CHANNELS, EVENTS } from '@shared/ipc'
import type { MissionScope } from '@shared/studioBridgeMissions'
import { sendToSender } from '@main/ipc/broadcast'
import { handle } from '@main/ipc/handle'
import { missionBelongsToScope, type MissionManager } from './manager'
import type { MissionRuntime } from './runtime'
import type { StudioEvent } from '@shared/domain/studioEvent'
import type { StudioEventBus } from './eventBus'

function parseScope(value: unknown): MissionScope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('mission scope must be an object')
  }
  if (!('projectId' in value) || value.projectId === undefined) return {}
  if (typeof value.projectId !== 'string' || value.projectId.length === 0) {
    throw new Error('mission project id must be a non-empty string')
  }
  return { projectId: value.projectId }
}

function parseGoal(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 10_000) {
    throw new Error('mission goal must be a non-empty bounded string')
  }
  return value
}

function parseAnswer(value: unknown): string {
  if (typeof value !== 'string' || value.length > 10_000) {
    throw new Error('mission answer must be a bounded string')
  }
  return value
}

export function registerMissionHandlers(
  manager: MissionManager,
  runtime?: MissionRuntime,
  events?: StudioEventBus,
): void {
  const scopes = new Map<number, { readonly sender: WebContents; readonly scope: MissionScope }>()
  manager.subscribe(mission => {
    for (const projection of scopes.values()) {
      if (missionBelongsToScope(mission, projection.scope)) {
        sendToSender(projection.sender, EVENTS.missionChanged, mission)
      }
    }
  })
  const forwardEvent = async (studioEvent: StudioEvent): Promise<void> => {
    if (!studioEvent.missionId) return
    const mission = await manager.read(studioEvent.missionId)
    if (!mission) return
    for (const projection of scopes.values()) {
      if (!projection.sender.isDestroyed() && missionBelongsToScope(mission, projection.scope)) {
        sendToSender(projection.sender, EVENTS.missionEvent, studioEvent)
      }
    }
  }
  events?.subscribe({}, studioEvent => {
    const forward = async (): Promise<void> => {
      try {
        await forwardEvent(studioEvent)
      } catch {
        // A window may close between the mission read and the send.
      }
    }
    void forward()
  })

  handle(CHANNELS.missionsWatch, async (event, value) => {
    const scope = parseScope(value)
    const senderId = event.sender.id
    scopes.set(senderId, { sender: event.sender, scope })
    event.sender.once('destroyed', () => scopes.delete(senderId))
    return await manager.list(scope)
  })

  handle(CHANNELS.missionsCreate, (event, goal) => {
    const projection = scopes.get(event.sender.id)
    if (!projection) throw new Error('window must watch missions before creating one')
    const parsed = parseGoal(goal)
    return runtime
      ? runtime.create(parsed, projection.scope)
      : manager.create(parsed, projection.scope)
  })

  handle(CHANNELS.missionsResume, async (event, stepId, answer) => {
    const projection = scopes.get(event.sender.id)
    if (!projection || !runtime) throw new Error('window must watch missions before resuming one')
    if (typeof stepId !== 'string') throw new Error('mission step id must be a string')
    const mission = (await manager.list(projection.scope)).find(candidate =>
      candidate.plan.steps.some(step => step.id === stepId),
    )
    if (!mission) throw new Error(`mission step ${stepId} does not belong to this window`)
    await runtime.scheduler.resume(mission.id, stepId, parseAnswer(answer))
    const resumed = await manager.read(mission.id)
    if (!resumed) throw new Error(`mission ${mission.id} disappeared`)
    return resumed
  })
}
