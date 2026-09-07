import type { Mission, MissionId, MissionStep, MissionStepId } from './mission'
import { isRecord } from '../guards'
import type { ActivityMessageKey, ActivityParams } from './activity'
import type { Ref } from './ref'

export type StudioEventState =
  'created' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled'

export type StudioEventCategory =
  | 'assistant'
  | 'mission'
  | 'step'
  | 'action'
  | 'job'
  | 'file'
  | 'project'
  | 'document'
  | 'scene'
  | 'generation'
  | 'memory'
  | 'system'

export type StudioEventPriority = 'background' | 'normal' | 'important' | 'critical'

export type StudioEventProgress = {
  current?: number
  total?: number
  ratio?: number
}

export type StudioEvent = {
  id: string
  at: string
  state: StudioEventState
  category: StudioEventCategory
  type: string
  priority: StudioEventPriority
  missionId?: MissionId
  stepId?: MissionStepId
  messageKey: ActivityMessageKey
  params?: ActivityParams
  progress?: StudioEventProgress
  refs?: readonly Ref[]
}

type StudioEventClock = { now: () => string; newId: () => string }

function stateOf(state: Mission['state'] | MissionStep['state']): StudioEventState {
  if (state === 'completed' || state === 'failed' || state === 'cancelled') return state
  if (
    state === 'waiting' ||
    state === 'waiting_user' ||
    state === 'waiting_job' ||
    state === 'waiting_dependency' ||
    state === 'paused'
  )
    return 'waiting'
  if (state === 'running') return 'running'
  return 'created'
}

function eventForStep(mission: Mission, step: MissionStep, clock: StudioEventClock): StudioEvent {
  const ratio =
    isRecord(step.result) && typeof step.result['progress'] === 'number'
      ? step.result['progress']
      : undefined
  return {
    id: `event_${clock.newId()}`,
    at: clock.now(),
    state: stateOf(step.state),
    category: step.kind === 'action' ? 'action' : step.kind === 'job' ? 'generation' : 'step',
    type: `mission.step.${step.kind}`,
    priority: step.state === 'failed' ? 'important' : 'normal',
    missionId: mission.id,
    stepId: step.id,
    messageKey: 'activity.missionStateChanged',
    params: { label: step.title, ...(step.error ? { error: step.error } : {}) },
    ...(ratio === undefined ? {} : { progress: { ratio } }),
  }
}

export function studioEventsForMission(
  mission: Mission,
  previous: Mission | null,
  clock: StudioEventClock,
): readonly StudioEvent[] {
  const before = new Map(previous?.plan.steps.map(step => [step.id, step.state]) ?? [])
  const changed = mission.plan.steps.filter(step => before.get(step.id) !== step.state)
  const missionChanged = previous === null || previous.state !== mission.state
  return [
    ...(missionChanged
      ? [
          {
            id: `event_${clock.newId()}`,
            at: clock.now(),
            state: stateOf(mission.state),
            category: 'mission',
            type: `mission.${mission.state}`,
            priority: mission.state === 'failed' ? 'critical' : 'normal',
            missionId: mission.id,
            messageKey: 'activity.missionStateChanged',
            params: { label: mission.goal, ...(mission.summary ? { error: mission.summary } : {}) },
          } satisfies StudioEvent,
        ]
      : []),
    ...changed.map(step => eventForStep(mission, step, clock)),
  ]
}
