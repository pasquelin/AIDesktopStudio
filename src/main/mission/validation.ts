import { ACTION_REGISTRY } from '@shared/domain/assistant'
import type {
  Mission,
  MissionState,
  MissionStep,
  MissionStepState,
  MissionWaiting,
} from '@shared/domain/mission'
import type { Ref } from '@shared/domain/ref'

const MISSION_STATES: readonly MissionState[] = [
  'created',
  'planning',
  'ready',
  'running',
  'waiting_user',
  'waiting_job',
  'waiting_dependency',
  'paused',
  'completed',
  'failed',
  'cancelled',
]

const STEP_STATES: readonly MissionStepState[] = [
  'pending',
  'ready',
  'running',
  'waiting',
  'completed',
  'failed',
  'cancelled',
  'skipped',
]

const recordOf = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null

const stringsOf = (value: unknown): readonly string[] | null =>
  Array.isArray(value) && value.every(item => typeof item === 'string') ? value : null

function refOf(value: unknown): Ref | null {
  const record = recordOf(value)
  if (!record || typeof record.kind !== 'string') return null
  return simpleRefOf(record) ?? documentRefOf(record) ?? componentRefOf(record)
}

function simpleRefOf(record: Record<string, unknown>): Ref | null {
  if (record.kind === 'script' && typeof record.path === 'string')
    return { kind: record.kind, path: record.path }
  if (
    (record.kind === 'asset' || record.kind === 'document' || record.kind === 'prefab') &&
    typeof record.id === 'string'
  )
    return { kind: record.kind, id: record.id }
  return null
}

function documentRefOf(record: Record<string, unknown>): Ref | null {
  if (
    (record.kind === 'entity' ||
      record.kind === 'track' ||
      record.kind === 'clip' ||
      record.kind === 'shot' ||
      record.kind === 'layer') &&
    typeof record.document === 'string' &&
    typeof record.id === 'string'
  )
    return { kind: record.kind, document: record.document, id: record.id }
  return null
}

function componentRefOf(record: Record<string, unknown>): Ref | null {
  if (record.kind !== 'component' || typeof record.document !== 'string') return null
  if (typeof record.entity !== 'string' || typeof record.type !== 'string') return null
  return { kind: record.kind, document: record.document, entity: record.entity, type: record.type }
}

type StoredStepBase = {
  readonly id: string
  readonly missionId: string
  readonly title: string
  readonly state: MissionStepState
  readonly dependsOn: readonly string[]
  readonly createdAt: string
  readonly result?: unknown
  readonly error?: string
  readonly startedAt?: string
  readonly finishedAt?: string
}

function stepBaseOf(
  value: unknown,
): { base: StoredStepBase; source: Record<string, unknown> } | null {
  const step = recordOf(value)
  if (!step || typeof step.id !== 'string' || typeof step.missionId !== 'string') return null
  const state = STEP_STATES.find(candidate => candidate === step.state)
  if (typeof step.title !== 'string' || !state) return null
  const dependsOn = stringsOf(step.dependsOn)
  if (!dependsOn || typeof step.createdAt !== 'string' || typeof step.kind !== 'string') return null
  return {
    source: step,
    base: {
      id: step.id,
      missionId: step.missionId,
      title: step.title,
      state,
      dependsOn,
      createdAt: step.createdAt,
      ...('result' in step ? { result: step.result } : {}),
      ...(typeof step.error === 'string' ? { error: step.error } : {}),
      ...(typeof step.startedAt === 'string' ? { startedAt: step.startedAt } : {}),
      ...(typeof step.finishedAt === 'string' ? { finishedAt: step.finishedAt } : {}),
    },
  }
}

function actionStepOf(base: StoredStepBase, step: Record<string, unknown>): MissionStep | null {
  if (step.kind !== 'action') return null
  const call = recordOf(step.call)
  const actionName =
    call && typeof call.action === 'string'
      ? ACTION_REGISTRY.find(action => action.name === call.action)?.name
      : undefined
  if (!call || !actionName || !recordOf(call.input)) return null
  return {
    ...base,
    kind: step.kind,
    call: { action: actionName, input: recordOf(call.input) ?? {} },
  }
}

function stepOf(value: unknown): MissionStep | null {
  const parsed = stepBaseOf(value)
  if (!parsed) return null
  const { base, source: step } = parsed
  if (step.kind === 'reason' || step.kind === 'user_input' || step.kind === 'verify') {
    return { ...base, kind: step.kind }
  }
  if (step.kind === 'job' && typeof step.jobId === 'string')
    return { ...base, kind: step.kind, jobId: step.jobId }
  if (step.kind === 'sub_mission' && typeof step.childMissionId === 'string') {
    return { ...base, kind: step.kind, childMissionId: step.childMissionId }
  }
  return actionStepOf(base, step)
}

function waitOf(value: unknown): MissionWaiting | null {
  const wait = recordOf(value)
  if (!wait || typeof wait.kind !== 'string' || typeof wait.stepId !== 'string') return null
  if (wait.kind === 'user') return { kind: wait.kind, stepId: wait.stepId }
  if (wait.kind === 'recovery' && wait.reason === 'action_outcome_unknown') {
    return { kind: wait.kind, stepId: wait.stepId, reason: wait.reason }
  }
  if (wait.kind === 'job' && typeof wait.jobId === 'string') {
    return { kind: wait.kind, stepId: wait.stepId, jobId: wait.jobId }
  }
  if (wait.kind === 'dependency' && typeof wait.missionId === 'string') {
    return { kind: wait.kind, stepId: wait.stepId, missionId: wait.missionId }
  }
  return null
}

function revisionsOf(value: unknown): Mission['revisionSnapshots'] | null {
  if (!Array.isArray(value)) return null
  const revisions = value.map(item => {
    const revision = recordOf(item)
    const resource = revision ? refOf(revision.resource) : null
    if (!resource || typeof revision?.revision !== 'number') return null
    return {
      resource,
      incarnation:
        typeof revision.incarnation === 'string' ? revision.incarnation : 'legacy-unknown',
      revision: revision.revision,
    }
  })
  return revisions.includes(null) ? null : revisions.filter(revision => revision !== null)
}

function waitMatchesStep(
  wait: MissionWaiting,
  step: MissionStep,
  childIds: readonly string[],
): boolean {
  if (wait.kind === 'user') return step.kind === 'user_input'
  if (wait.kind === 'recovery') return step.kind === 'action'
  if (wait.kind === 'job') return step.kind === 'job' && wait.jobId === step.jobId
  return (
    step.kind === 'sub_mission' &&
    wait.missionId === step.childMissionId &&
    childIds.includes(wait.missionId)
  )
}

function missionGraphIsValid(
  missionId: string,
  steps: readonly MissionStep[],
  waits: readonly MissionWaiting[],
  childIds: readonly string[],
): boolean {
  const ids = new Set<string>()
  for (const step of steps) {
    if (step.missionId !== missionId || ids.has(step.id)) return false
    if (step.dependsOn.some(dependency => !ids.has(dependency))) return false
    ids.add(step.id)
  }
  const waitsMatch = waits.every(wait => {
    const step = steps.find(candidate => candidate.id === wait.stepId)
    return step?.state === 'waiting' && waitMatchesStep(wait, step, childIds)
  })
  return (
    waitsMatch &&
    steps.every(step => step.state !== 'waiting' || waits.some(wait => wait.stepId === step.id))
  )
}

function missionListsOf(
  mission: Record<string, unknown>,
): Pick<Mission, 'childIds' | 'resourceRefs' | 'plan' | 'waits' | 'revisionSnapshots'> | null {
  const plan = recordOf(mission.plan)
  if (!Array.isArray(mission.resourceRefs) || !plan || !Array.isArray(plan.steps)) return null
  if (!Array.isArray(mission.waits)) return null
  const childIds = stringsOf(mission.childIds)
  const resourceRefs = mission.resourceRefs.map(refOf)
  const steps = plan.steps.map(stepOf)
  const waits = mission.waits.map(waitOf)
  const revisions = revisionsOf(mission.revisionSnapshots)
  if (
    !childIds ||
    resourceRefs.includes(null) ||
    steps.includes(null) ||
    waits.includes(null) ||
    !revisions
  ) {
    return null
  }
  const validSteps = steps.filter(step => step !== null)
  const validWaits = waits.filter(wait => wait !== null)
  if (!missionGraphIsValid(String(mission.id), validSteps, validWaits, childIds)) return null
  return {
    childIds,
    resourceRefs: resourceRefs.filter(ref => ref !== null),
    plan: { steps: validSteps },
    waits: validWaits,
    revisionSnapshots: revisions,
  }
}

function restoredStateIsValid(
  mission: Record<string, unknown>,
  state: MissionState,
  lists: Pick<Mission, 'plan' | 'waits'>,
): boolean {
  const terminal = state === 'completed' || state === 'failed' || state === 'cancelled'
  if (terminal !== (typeof mission.finishedAt === 'string')) return false
  if (new Set(lists.waits.map(wait => wait.stepId)).size !== lists.waits.length) return false
  if (terminal && lists.waits.length > 0) return false
  if (state === 'completed') {
    return (
      lists.plan.steps.length > 0 &&
      lists.plan.steps.every(step => step.state === 'completed' || step.state === 'skipped')
    )
  }
  if (terminal) {
    return lists.plan.steps.every(step =>
      ['completed', 'failed', 'cancelled', 'skipped'].includes(step.state),
    )
  }
  if (!workStateIsValid(state, lists)) return false
  return lists.plan.steps.every(step =>
    ['completed', 'failed', 'cancelled', 'skipped'].includes(step.state)
      ? typeof step.finishedAt === 'string'
      : step.finishedAt === undefined,
  )
}

function workStateIsValid(state: MissionState, lists: Pick<Mission, 'plan' | 'waits'>): boolean {
  const active = lists.plan.steps.some(step => step.state === 'ready' || step.state === 'running')
  const firstWait = lists.waits[0]
  if (state === 'running' && lists.waits.length > 0 && !active) return false
  if (state === 'waiting_user') {
    if (active || (firstWait?.kind !== 'user' && firstWait?.kind !== 'recovery')) return false
  }
  if (state === 'waiting_job' && (active || firstWait?.kind !== 'job')) return false
  if (state === 'waiting_dependency' && (active || firstWait?.kind !== 'dependency')) return false
  if (
    (state === 'created' || state === 'planning' || state === 'ready') &&
    lists.waits.length > 0
  ) {
    return false
  }
  return true
}

export function parseMission(value: unknown): Mission | null {
  const mission = recordOf(value)
  if (!mission || typeof mission.id !== 'string' || typeof mission.goal !== 'string') return null
  const revision = mission.revision === undefined ? 0 : mission.revision
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0) return null
  const state = MISSION_STATES.find(candidate => candidate === mission.state)
  const lists = missionListsOf(mission)
  if (!state || !lists) return null
  if (!restoredStateIsValid(mission, state, lists)) return null
  if (typeof mission.createdAt !== 'string' || typeof mission.updatedAt !== 'string') return null
  return {
    id: mission.id,
    revision,
    ...(typeof mission.parentId === 'string' ? { parentId: mission.parentId } : {}),
    ...lists,
    goal: mission.goal,
    state,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
    ...(typeof mission.startedAt === 'string' ? { startedAt: mission.startedAt } : {}),
    ...(typeof mission.finishedAt === 'string' ? { finishedAt: mission.finishedAt } : {}),
    ...(typeof mission.projectId === 'string' ? { projectId: mission.projectId } : {}),
    ...(typeof mission.summary === 'string' ? { summary: mission.summary } : {}),
    ...(recordOf(mission.result) ? { result: recordOf(mission.result) ?? {} } : {}),
  }
}
