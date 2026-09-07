import type { AssistantCall } from './assistant'
import type { Ref } from './ref'

export type MissionId = string
export type MissionStepId = string

export type MissionState =
  | 'created'
  | 'planning'
  | 'ready'
  | 'running'
  | 'waiting_user'
  | 'waiting_job'
  | 'waiting_dependency'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type MissionStepState =
  'pending' | 'ready' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled' | 'skipped'

export type ResourceRevision = {
  readonly resource: Ref
  readonly incarnation: string
  readonly revision: number
}

export type MissionWaiting =
  | { kind: 'user'; stepId: MissionStepId }
  | {
      kind: 'recovery'
      stepId: MissionStepId
      reason: 'action_outcome_unknown' | 'scope_unavailable'
    }
  | { kind: 'job'; stepId: MissionStepId; jobId: string }
  | { kind: 'dependency'; stepId: MissionStepId; missionId: MissionId }

export type MissionResult = {
  summary?: string
  data?: unknown
}

type MissionStepBase = {
  readonly id: MissionStepId
  readonly missionId: MissionId
  readonly title: string
  readonly state: MissionStepState
  readonly dependsOn: readonly MissionStepId[]
  readonly result?: unknown
  readonly error?: string
  readonly createdAt: string
  readonly startedAt?: string
  readonly finishedAt?: string
}

export type MissionStep = MissionStepBase &
  (
    | { kind: 'reason' | 'user_input' | 'verify' }
    | { kind: 'action'; call: AssistantCall }
    | { kind: 'job'; jobId: string }
    | { kind: 'sub_mission'; childMissionId: MissionId }
  )

export type MissionStepDraft =
  | { kind: 'reason' | 'user_input' | 'verify' }
  | { kind: 'action'; call: AssistantCall }
  | { kind: 'job'; jobId: string }
  | { kind: 'sub_mission'; childMissionId: MissionId }

export type MissionStepKind = MissionStepDraft['kind']

export type MissionPlan = {
  readonly steps: readonly MissionStep[]
}

export type Mission = {
  readonly id: MissionId
  readonly revision: number
  readonly parentId?: MissionId
  readonly childIds: readonly MissionId[]
  readonly goal: string
  readonly state: MissionState
  readonly createdAt: string
  readonly updatedAt: string
  readonly startedAt?: string
  readonly finishedAt?: string
  readonly projectId?: string
  readonly resourceRefs: readonly Ref[]
  readonly plan: MissionPlan
  readonly summary?: string
  readonly result?: MissionResult
  readonly waits: readonly MissionWaiting[]
  readonly revisionSnapshots: readonly ResourceRevision[]
}

export type MissionClock = {
  now: () => string
  newId: () => string
}

const MISSION_TRANSITIONS: Record<MissionState, readonly MissionState[]> = {
  created: ['planning', 'failed', 'cancelled'],
  planning: ['ready', 'failed', 'cancelled'],
  ready: ['running', 'failed', 'cancelled'],
  running: [
    'waiting_user',
    'waiting_job',
    'waiting_dependency',
    'paused',
    'completed',
    'failed',
    'cancelled',
  ],
  waiting_user: ['running', 'paused', 'failed', 'cancelled'],
  waiting_job: ['running', 'paused', 'failed', 'cancelled'],
  waiting_dependency: ['running', 'paused', 'failed', 'cancelled'],
  paused: ['running', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
}

const STEP_TRANSITIONS: Record<MissionStepState, readonly MissionStepState[]> = {
  pending: ['ready', 'skipped', 'cancelled'],
  ready: ['running', 'skipped', 'cancelled'],
  running: ['waiting', 'completed', 'failed', 'cancelled'],
  waiting: ['ready', 'running', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
  skipped: [],
}

export function createMission(goal: string, clock: MissionClock, parentId?: MissionId): Mission {
  const at = clock.now()
  return {
    id: `mission_${clock.newId()}`,
    revision: 0,
    ...(parentId ? { parentId } : {}),
    childIds: [],
    goal,
    state: 'created',
    createdAt: at,
    updatedAt: at,
    resourceRefs: [],
    plan: { steps: [] },
    waits: [],
    revisionSnapshots: [],
  }
}

export function createMissionStep(
  missionId: MissionId,
  title: string,
  draft: MissionStepDraft,
  clock: MissionClock,
  dependsOn: readonly MissionStepId[] = [],
): MissionStep {
  return {
    id: `step_${clock.newId()}`,
    missionId,
    title,
    state: 'pending',
    dependsOn: [...dependsOn],
    ...draft,
    createdAt: clock.now(),
  }
}

export function addMissionStep(mission: Mission, step: MissionStep, now: string): Mission {
  if (isMissionFinished(mission.state)) throw new Error('finished mission cannot accept a step')
  if (step.missionId !== mission.id) throw new Error('mission step belongs to another mission')
  if (mission.plan.steps.some(existing => existing.id === step.id)) {
    throw new Error(`mission step ${step.id} already exists`)
  }
  if (new Set(step.dependsOn).size !== step.dependsOn.length) {
    throw new Error(`mission step ${step.id} repeats a dependency`)
  }
  if (step.dependsOn.some(id => !mission.plan.steps.some(existing => existing.id === id))) {
    throw new Error(`mission step ${step.id} depends on an unknown step`)
  }
  return { ...mission, updatedAt: now, plan: { steps: [...mission.plan.steps, step] } }
}

export function attachChildMission(parent: Mission, child: Mission, now: string): Mission {
  if (isMissionFinished(parent.state)) throw new Error('finished mission cannot accept a child')
  if (child.parentId !== parent.id) throw new Error('child mission does not name its parent')
  if (parent.childIds.includes(child.id)) return parent
  return { ...parent, updatedAt: now, childIds: [...parent.childIds, child.id] }
}

type MissionDirectState = Exclude<
  MissionState,
  'waiting_user' | 'waiting_job' | 'waiting_dependency'
>

export function transitionMission(
  mission: Mission,
  state: MissionDirectState,
  now: string,
): Mission {
  if (!MISSION_TRANSITIONS[mission.state].includes(state)) {
    throw new Error(`mission cannot transition from ${mission.state} to ${state}`)
  }
  if (
    state === 'running' &&
    mission.waits.length > 0 &&
    !mission.plan.steps.some(step => step.state === 'ready' || step.state === 'running')
  ) {
    throw new Error('mission cannot resume before one of its waits')
  }
  if (state === 'completed' && !missionCanComplete(mission)) {
    throw new Error('mission cannot complete with unfinished steps or waits')
  }

  return {
    ...mission,
    state,
    updatedAt: now,
    plan: { steps: missionStepsAtEnd(mission.plan.steps, state, now) },
    waits: mission.waits,
    ...(state === 'running' && mission.startedAt === undefined ? { startedAt: now } : {}),
    ...(isMissionFinished(state) ? { finishedAt: now, waits: [] } : {}),
  }
}

export function waitMission(mission: Mission, waiting: MissionWaiting, now: string): Mission {
  if (mission.state !== 'running' && !mission.state.startsWith('waiting_')) {
    throw new Error(`mission cannot wait while ${mission.state}`)
  }
  validateMissionWait(mission, waiting)
  const waits = [...mission.waits.filter(wait => wait.stepId !== waiting.stepId), waiting]
  const steps = mission.plan.steps.map(step =>
    step.id === waiting.stepId ? missionStepInState(step, 'waiting', now) : step,
  )
  return {
    ...mission,
    state: missionStateForWork(steps, waits),
    updatedAt: now,
    plan: { steps },
    waits,
  }
}

export function resumeMission(mission: Mission, stepId: MissionStepId, now: string): Mission {
  return resolveMissionWait(mission, stepId, 'ready', now)
}

export function resolveMissionWait(
  mission: Mission,
  stepId: MissionStepId,
  state: 'ready' | 'failed' | 'cancelled',
  now: string,
): Mission {
  if (!mission.waits.some(wait => wait.stepId === stepId)) {
    throw new Error(`mission does not wait on step ${stepId}`)
  }
  const step = mission.plan.steps.find(candidate => candidate.id === stepId)
  if (!step || step.state !== 'waiting') throw new Error(`mission wait lost step ${stepId}`)
  const waits = mission.waits.filter(wait => wait.stepId !== stepId)
  const steps = mission.plan.steps.map(candidate =>
    candidate.id === step.id ? missionStepInState(step, state, now) : candidate,
  )
  return {
    ...mission,
    state: waits.some(wait => wait.kind === 'recovery')
      ? 'paused'
      : missionStateForWork(steps, waits),
    updatedAt: now,
    plan: { steps },
    waits,
  }
}

function missionStateForWork(
  steps: readonly MissionStep[],
  waits: readonly MissionWaiting[],
): MissionState {
  if (steps.some(step => step.state === 'ready' || step.state === 'running')) return 'running'
  return waits[0] ? waitingStateOf(waits[0]) : 'running'
}

function missionStepsAtEnd(
  steps: readonly MissionStep[],
  state: MissionState,
  now: string,
): readonly MissionStep[] {
  if (state !== 'failed' && state !== 'cancelled') return steps
  return steps.map(step => {
    if (isMissionStepFinished(step.state)) return step
    const terminal =
      state === 'failed' && (step.state === 'running' || step.state === 'waiting')
        ? 'failed'
        : 'cancelled'
    return { ...step, state: terminal, finishedAt: now }
  })
}

function waitingStateOf(waiting: MissionWaiting): MissionState {
  if (waiting.kind === 'recovery') return 'paused'
  if (waiting.kind === 'user') return 'waiting_user'
  if (waiting.kind === 'job') return 'waiting_job'
  return 'waiting_dependency'
}

function validateMissionWait(mission: Mission, waiting: MissionWaiting): void {
  const step = mission.plan.steps.find(candidate => candidate.id === waiting.stepId)
  if (!step) throw new Error(`mission cannot wait on unknown step ${waiting.stepId}`)
  if (step.state !== 'running' && step.state !== 'waiting') {
    throw new Error(`mission cannot wait on inactive step ${step.id}`)
  }
  if (
    (waiting.kind === 'user' && step.kind !== 'user_input') ||
    (waiting.kind === 'recovery' && step.kind !== 'action') ||
    (waiting.kind === 'job' && step.kind !== 'job') ||
    (waiting.kind === 'dependency' && step.kind !== 'sub_mission')
  ) {
    throw new Error(`mission wait does not match step ${step.id}`)
  }
  if (waiting.kind === 'job' && step.kind === 'job' && waiting.jobId !== step.jobId) {
    throw new Error(`mission wait does not match job ${step.jobId}`)
  }
  if (
    waiting.kind === 'dependency' &&
    step.kind === 'sub_mission' &&
    waiting.missionId !== step.childMissionId
  ) {
    throw new Error(`mission wait does not match child ${step.childMissionId}`)
  }
  if (waiting.kind === 'dependency' && !mission.childIds.includes(waiting.missionId)) {
    throw new Error(`mission does not own child ${waiting.missionId}`)
  }
}

export function recoverInterruptedMission(mission: Mission, now: string): Mission {
  const interrupted = mission.plan.steps.filter(step => step.state === 'running')
  if (interrupted.length === 0) return mission
  const waits = [...mission.waits]
  for (const step of interrupted) {
    if (step.kind === 'action')
      waits.push({ kind: 'recovery', stepId: step.id, reason: 'action_outcome_unknown' })
    if (step.kind === 'job') waits.push({ kind: 'job', stepId: step.id, jobId: step.jobId })
    if (step.kind === 'user_input') waits.push({ kind: 'user', stepId: step.id })
    if (step.kind === 'sub_mission')
      waits.push({ kind: 'dependency', stepId: step.id, missionId: step.childMissionId })
  }
  const steps = mission.plan.steps.map(step => {
    if (!interrupted.includes(step)) return step
    return missionStepInState(
      step,
      step.kind === 'reason' || step.kind === 'verify' ? 'ready' : 'waiting',
      now,
    )
  })
  return {
    ...mission,
    state: waits.some(wait => wait.kind === 'recovery')
      ? 'paused'
      : missionStateForWork(steps, waits),
    updatedAt: now,
    plan: { steps },
    waits,
  }
}

export function transitionMissionStep(
  mission: Mission,
  stepId: MissionStepId,
  state: MissionStepState,
  now: string,
): Mission {
  validateMissionStepTransition(mission, stepId)
  const step = mission.plan.steps.find(candidate => candidate.id === stepId)
  if (!step) throw new Error(`mission does not hold step ${stepId}`)
  if (step.state === 'waiting' && mission.waits.some(wait => wait.stepId === step.id)) {
    throw new Error(`mission step ${step.id} must resume with its wait`)
  }
  if (state === 'waiting') throw new Error(`mission step ${step.id} must wait with a reason`)
  if (!STEP_TRANSITIONS[step.state].includes(state)) {
    throw new Error(`mission step cannot transition from ${step.state} to ${state}`)
  }
  if (state === 'running' && mission.state === 'ready') {
    throw new Error(`mission step ${step.id} cannot start before its mission`)
  }
  if (state === 'ready' && !dependenciesFinished(mission, step)) {
    throw new Error(`mission step ${step.id} has unfinished dependencies`)
  }
  const steps = mission.plan.steps.map(candidate =>
    candidate.id === step.id ? missionStepInState(step, state, now) : candidate,
  )
  return {
    ...mission,
    state: mission.waits.length > 0 ? missionStateForWork(steps, mission.waits) : mission.state,
    updatedAt: now,
    plan: { steps },
  }
}

function validateMissionStepTransition(mission: Mission, stepId: MissionStepId): void {
  if (
    mission.state !== 'ready' &&
    mission.state !== 'running' &&
    !mission.state.startsWith('waiting_')
  ) {
    throw new Error(`mission steps cannot transition while mission is ${mission.state}`)
  }
  if (!mission.plan.steps.some(step => step.id === stepId)) {
    throw new Error(`mission does not hold step ${stepId}`)
  }
}

function missionStepInState(step: MissionStep, state: MissionStepState, now: string): MissionStep {
  return {
    ...step,
    state,
    ...(state === 'running' && step.startedAt === undefined ? { startedAt: now } : {}),
    ...(isMissionStepFinished(state) ? { finishedAt: now } : {}),
  }
}

function dependenciesFinished(mission: Mission, step: MissionStep): boolean {
  return step.dependsOn.every(id => {
    const dependency = mission.plan.steps.find(candidate => candidate.id === id)
    return dependency?.state === 'completed' || dependency?.state === 'skipped'
  })
}

export function missionCanComplete(mission: Mission): boolean {
  return (
    mission.waits.length === 0 &&
    mission.plan.steps.length > 0 &&
    mission.plan.steps.every(step => step.state === 'completed' || step.state === 'skipped')
  )
}

/**
 * The completed steps before `stepId`, grouped by round — what one answer of the model planned,
 * closed by the reason or verify step that followed. Newest first; the last round is still open.
 */
export function completedRoundsBefore(
  mission: Mission,
  stepId: MissionStepId,
): readonly (readonly MissionStep[])[] {
  const rounds: MissionStep[][] = [[]]
  for (const step of mission.plan.steps) {
    if (step.id === stepId) break
    if (step.state !== 'completed') continue
    if (step.kind === 'reason' || step.kind === 'verify') rounds.push([])
    else rounds.at(-1)?.push(step)
  }
  return rounds.reverse()
}

export function isMissionFinished(state: MissionState): boolean {
  return state === 'completed' || state === 'failed' || state === 'cancelled'
}

export function isMissionStepFinished(state: MissionStepState): boolean {
  return state === 'completed' || state === 'failed' || state === 'cancelled' || state === 'skipped'
}
