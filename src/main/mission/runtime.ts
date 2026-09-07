import {
  ACTION_RESOURCES,
  ACTION_REGISTRY,
  assistantAction,
  type ActionOutcome,
  type ActionRefusal,
  type ActionResource,
  type AssistantAnswer,
} from '@shared/domain/assistant'
import type { Job } from '@shared/domain/job'
import {
  addMissionStep,
  createMissionStep,
  isMissionFinished,
  recoverInterruptedMission,
  type Mission,
  type MissionClock,
} from '@shared/domain/mission'
import { refToString, type Ref } from '@shared/domain/ref'
import type { AssistantBrain } from '@main/assistant/brainPort'
import type { RemoteActions } from '@main/mcp/asking'
import type { JobManager } from '@main/provider/jobManager'
import type { AssistantContextBuilder } from './contextBuilder'
import { repeatingOutcome, repeatsLastRound, unreadableOutcome } from './runtimeGuards'
import { hasDependentVerification, plannedFrom, reasoningStep } from './runtimePlanning'
import { assetIdsFromJobResult } from './jobResult'
import type { MissionMetrics } from './metrics'
import type { MissionManager, MissionScope } from './manager'
import {
  createMissionScheduler,
  type MissionRevisionCheck,
  type MissionRevisionReader,
  type MissionScheduler,
  type MissionStepOutcome,
} from './scheduler'

export type MissionRuntime = {
  create: (goal: string, scope: MissionScope) => Promise<Mission>
  start: () => Promise<void>
  scheduler: MissionScheduler
}

type RuntimeDeps = {
  manager: MissionManager
  context: AssistantContextBuilder
  brain: AssistantBrain
  actions: RemoteActions
  jobs: Pick<JobManager, 'list'>
  revisions: MissionRevisionReader
  clock: MissionClock
  metrics?: MissionMetrics
}

const contextText = (context: Awaited<ReturnType<AssistantContextBuilder['build']>>): string => {
  const compact = {
    ...context,
    actions: context.actions.map(hit => ({ name: hit.action.name, score: hit.score })),
  }
  return JSON.stringify(compact, (_key, value: unknown) =>
    value instanceof Uint8Array ? `[${value.byteLength} image bytes]` : value,
  )
}

const MAX_MISSION_STEPS = 48

type ReferenceRefusal = {
  ok: false
  refusal: 'untrustedReference'
  field: string
  given: string
  validReferences: readonly string[]
}

function referenceValues(value: unknown, key: string): readonly string[] {
  if (Array.isArray(value)) return value.flatMap(item => referenceValues(item, key))
  if (typeof value !== 'object' || value === null) return []
  const reference = Object.entries(value).find(([entryKey]) => entryKey === key)?.[1]
  return typeof reference === 'string' ? [reference] : []
}

function referencesReturned(
  mission: Mission,
  resource: ActionResource,
): { authoritative: boolean; values: readonly string[] } {
  const steps = mission.plan.steps.filter(
    step =>
      step.kind === 'action' &&
      step.state === 'completed' &&
      (assistantAction(step.call.action)?.returns ?? []).includes(resource),
  )
  const jobReferences =
    resource === 'projectAssetCandidates'
      ? mission.plan.steps.flatMap(step =>
          step.kind === 'job' && step.state === 'completed'
            ? assetIdsFromJobResult(step.result)
            : [],
        )
      : []
  const reference = ACTION_RESOURCES[resource].reference
  return {
    authoritative: steps.length > 0 || jobReferences.length > 0,
    values: reference
      ? [
          ...new Set([
            ...steps.flatMap(step => referenceValues(step.result, reference.key)),
            ...jobReferences,
          ]),
        ]
      : [],
  }
}

function resourceAvailable(mission: Mission, resource: ActionResource): boolean {
  return mission.plan.steps.some(step => {
    if (step.state !== 'completed') return false
    if (step.kind === 'job')
      return resource === 'projectAssetCandidates' && assetIdsFromJobResult(step.result).length > 0
    if (step.kind !== 'action') return false
    const descriptor = assistantAction(step.call.action)
    if (descriptor?.produces?.includes(resource)) return true
    if (!descriptor?.returns?.includes(resource)) return false
    return Array.isArray(step.result)
      ? step.result.length > 0
      : step.result !== undefined && step.result !== null
  })
}

function missingResources(
  mission: Mission,
  step: Extract<Mission['plan']['steps'][number], { kind: 'action' }>,
): readonly ActionResource[] {
  const descriptor = assistantAction(step.call.action)
  return [...(descriptor?.requires ?? []), ...(descriptor?.inputs ?? [])].filter(
    resource => !resourceAvailable(mission, resource),
  )
}

/** The `id` of every entry of a list named for the kind — `shots: [{ id }]` as scene.state answers. */
function listedIds(value: unknown, collection: string): readonly string[] {
  if (Array.isArray(value)) return value.flatMap(item => listedIds(item, collection))
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([key, entry]) =>
    key === collection && Array.isArray(entry)
      ? entry.flatMap(item => referenceValues(item, 'id'))
      : listedIds(entry, collection),
  )
}

const seenInResults = (mission: Mission, kind: string, given: string): boolean =>
  mission.plan.steps.some(
    step =>
      step.kind === 'action' &&
      step.state === 'completed' &&
      listedIds(step.result, `${kind}s`).includes(given),
  )

function referenceRefusal(
  mission: Mission,
  step: Extract<Mission['plan']['steps'][number], { kind: 'action' }>,
): ReferenceRefusal | null {
  const descriptor = assistantAction(step.call.action)
  if (!descriptor) return null
  for (const field of descriptor.fields) {
    if (!field.reference || typeof step.call.input[field.key] !== 'string') continue
    const resources = [...(descriptor.inputs ?? []), ...(descriptor.uses ?? [])].filter(
      resource => ACTION_RESOURCES[resource].reference?.kind === field.reference,
    )
    const returned = resources.map(resource => referencesReturned(mission, resource))
    if (!returned.some(result => result.authoritative)) continue
    const validReferences = [...new Set(returned.flatMap(result => result.values))]
    const given = step.call.input[field.key]
    // A shot the decor made and scene.state showed is not invented: once the mission adds one,
    // its own answers would otherwise be the only ids allowed (review, 2026-09-06).
    if (
      typeof given === 'string' &&
      !validReferences.includes(given) &&
      !seenInResults(mission, field.reference, given)
    ) {
      return {
        ok: false,
        refusal: 'untrustedReference',
        field: field.key,
        given,
        validReferences,
      }
    }
  }
  return null
}

const jobIdOf = (value: unknown): string | null => {
  if (typeof value !== 'object' || value === null || !('jobId' in value)) return null
  return typeof value.jobId === 'string' ? value.jobId : null
}

const terminalJob = (jobs: readonly Job[], jobId: string): Job | null => {
  const job = jobs.find(candidate => candidate.id === jobId)
  return job && job.status !== 'queued' && job.status !== 'running' ? job : null
}

function missingResourceOutcome(missing: readonly ActionResource[]): MissionStepOutcome {
  return {
    kind: 'planned',
    result: {
      ok: false,
      refusal: 'missingResources',
      resources: missing,
      producers: ACTION_REGISTRY.filter(action =>
        missing.some(
          resource => action.produces?.includes(resource) || action.returns?.includes(resource),
        ),
      ).map(action => action.name),
    },
    steps: [reasoningStep()],
  }
}

/**
 * Final when a person said no, nobody was there to ask, or a dialog only a person can close;
 * every other refusal goes back to the model with its detail — `failed` on an invented id killed
 * 2.5 outright (2026-09-06).
 */
const REFUSAL_FATE: Record<ActionRefusal, 'final' | 'repairable'> = {
  declined: 'final',
  noConfirmer: 'final',
  timedOut: 'final',
  noWindow: 'final',
  noBridge: 'final',
  unknownCommand: 'repairable',
  wrongSurface: 'repairable',
  generatorClosed: 'repairable',
  nothingPrepared: 'repairable',
  notSubmitted: 'repairable',
  badInput: 'repairable',
  noProject: 'repairable',
  noReference: 'repairable',
  ambiguousLanding: 'repairable',
  formChanged: 'repairable',
  notFound: 'repairable',
  notAllowed: 'repairable',
  nativeDialog: 'final',
  notRenderable: 'repairable',
  needsConsent: 'final',
  failed: 'repairable',
}

function refusedActionOutcome(
  step: Extract<Mission['plan']['steps'][number], { kind: 'action' }>,
  outcome: Extract<ActionOutcome, { ok: false }>,
): MissionStepOutcome {
  return REFUSAL_FATE[outcome.refusal] === 'final'
    ? { kind: 'failed', error: `action ${step.call.action}: ${outcome.refusal}` }
    : {
        kind: 'planned',
        result: { ...outcome, action: step.call.action, input: step.call.input },
        steps: [reasoningStep()],
      }
}

export function createMissionRuntime(deps: RuntimeDeps): MissionRuntime {
  const buildContext = async (
    mission: Mission,
    step: Mission['plan']['steps'][number],
    visual = false,
  ): ReturnType<AssistantContextBuilder['build']> => {
    const context = await deps.context.build({ mission, step, request: mission.goal, visual })
    if (context.document) {
      const resource: Ref = { kind: 'document', id: context.document.id }
      // 🛑 Read back rather than trust the caller's `mission`: `runAction` builds a context, then
      // `think` builds a SECOND one from the same object, whose revision the first append moved.
      const held = (await deps.manager.read(mission.id)) ?? mission
      if (!held.resourceRefs.some(ref => refToString(ref) === refToString(resource))) {
        await deps.manager.update(held.id, held.revision, current => ({
          ...current,
          resourceRefs: [...current.resourceRefs, resource],
        }))
      }
    }
    return context
  }

  const think = async (
    mission: Mission,
    step: Mission['plan']['steps'][number],
    signal: AbortSignal,
    utterance: string,
  ): Promise<AssistantAnswer> => {
    const capabilities = await deps.brain.capabilities()
    const visualRequest =
      /\b(inspect|look at|compare visually|visual appearance|inspecte|regarde|compare visuellement|apparence visuelle)\b/iu
    const wantsVisual =
      capabilities.multimodalImages && visualRequest.test(`${mission.goal} ${step.title}`)
    const context = await buildContext(mission, step, wantsVisual)
    const serialized = contextText(context)
    deps.metrics?.context(context, serialized.length)
    deps.metrics?.llmCall(step.kind === 'reason')
    const searchActions = deps.context.searchActions
    return await deps.brain.think(
      {
        utterance,
        history: [],
        // 🛑 Without it the model is handed the bare goal after each action and does it again:
        // 6.1 wants ONE cube, and a second `node.add` on the "Continue mission" round killed it.
        // Read off the block the sentence names, so flag and prose agree by construction.
        continuing: context.previousResults.length > 0,
        context: serialized,
        candidates: context.actions.map(hit => hit.action.name),
        mission: true,
        images: context.visual?.map(({ mimeType, bytes }) => ({ mimeType, bytes })),
      },
      searchActions
        ? {
            signal,
            discover: async query =>
              (
                await searchActions(
                  { mission, step, request: mission.goal, visual: wantsVisual },
                  query,
                )
              ).map(hit => hit.action.name),
          }
        : { signal },
    )
  }

  const runAction = async (
    mission: Mission,
    step: Extract<Mission['plan']['steps'][number], { kind: 'action' }>,
    signal: AbortSignal,
    revision: MissionRevisionCheck,
  ): Promise<MissionStepOutcome> => {
    const context = await buildContext(mission, step)
    if (mission.projectId && context.project?.path !== mission.projectId) {
      return {
        kind: 'waiting',
        wait: { kind: 'recovery', stepId: step.id, reason: 'scope_unavailable' },
      }
    }
    if (revision.decision === 'reconsider') {
      deps.metrics?.replan()
      const answer = await think(
        mission,
        step,
        signal,
        `Re-evaluate this action after the document changed: ${JSON.stringify(step.call)}`,
      )
      if (answer.unreadable) return unreadableOutcome
      return {
        kind: 'planned',
        result: { say: answer.say, ask: answer.ask },
        steps: plannedFrom(answer, hasDependentVerification(mission, step.id)),
      }
    }
    const missing = missingResources(mission, step)
    if (missing.length > 0) return missingResourceOutcome(missing)
    const refused = referenceRefusal(mission, step)
    if (refused) {
      return { kind: 'planned', result: refused, steps: [reasoningStep()] }
    }
    const outcome = await deps.actions.run(step.call, signal)
    if (!outcome.ok) return refusedActionOutcome(step, outcome)
    const jobId = jobIdOf(outcome.data)
    return jobId
      ? {
          kind: 'planned',
          result: outcome.data,
          steps: [{ title: `Wait for ${jobId}`, draft: { kind: 'job', jobId } }],
        }
      : { kind: 'completed', result: outcome.data }
  }

  const passiveOutcome = (
    step: Mission['plan']['steps'][number],
    revision: MissionRevisionCheck,
  ): MissionStepOutcome | null => {
    if (step.kind === 'user_input') {
      if (!revision.resumed) deps.metrics?.wait('user')
      return revision.resumed
        ? { kind: 'completed' }
        : { kind: 'waiting', wait: { kind: 'user', stepId: step.id } }
    }
    if (step.kind === 'job') {
      const job = terminalJob(deps.jobs.list(), step.jobId)
      if (!job) {
        deps.metrics?.wait('job')
        return { kind: 'waiting', wait: { kind: 'job', stepId: step.id, jobId: step.jobId } }
      }
      return job.status === 'succeeded'
        ? { kind: 'completed', result: job }
        : { kind: 'failed', error: `job ${job.id} ${job.status}` }
    }
    return step.kind === 'sub_mission'
      ? {
          kind: 'waiting',
          wait: { kind: 'dependency', stepId: step.id, missionId: step.childMissionId },
        }
      : null
  }

  const runner = async (
    step: Mission['plan']['steps'][number],
    signal: AbortSignal,
    revision: MissionRevisionCheck,
  ): Promise<MissionStepOutcome> => {
    const mission = await deps.manager.read(step.missionId)
    if (!mission) return { kind: 'failed', error: `mission ${step.missionId} disappeared` }
    if (revision.decision === 'reconsider') deps.metrics?.revisionConflict()
    const passive = passiveOutcome(step, revision)
    if (passive) return passive
    if (step.kind === 'action') return await runAction(mission, step, signal, revision)
    return await plan(mission, step, signal)
  }

  const plan = async (
    mission: Mission,
    step: Mission['plan']['steps'][number],
    signal: AbortSignal,
  ): Promise<MissionStepOutcome> => {
    if (mission.plan.steps.length >= MAX_MISSION_STEPS) {
      return { kind: 'failed', error: 'mission step limit reached' }
    }
    const answer = await think(
      mission,
      step,
      signal,
      step.kind === 'verify'
        ? `Verify from the current state whether this is done, and plan the next calls if it is not: ${mission.goal}`
        : mission.goal,
    )
    if (answer.unreadable) return unreadableOutcome
    if (repeatsLastRound(mission, step, answer)) return repeatingOutcome
    const steps = plannedFrom(answer, hasDependentVerification(mission, step.id))
    if (mission.plan.steps.length + steps.length > MAX_MISSION_STEPS) {
      return { kind: 'failed', error: 'mission step limit reached' }
    }
    deps.metrics?.plannedSteps(steps.length)
    return {
      kind: 'planned',
      result: { say: answer.say, ask: answer.ask },
      steps,
    }
  }

  const scheduler = createMissionScheduler(deps.manager, runner, deps.clock, 2, deps.revisions)
  return {
    scheduler,
    start: async () => {
      for (const mission of await deps.manager.list({})) {
        if (isMissionFinished(mission.state)) continue
        const recovered = recoverInterruptedMission(mission, deps.clock.now())
        if (recovered !== mission) {
          await deps.manager.update(mission.id, mission.revision, () => recovered)
        }
        if (recovered.state !== 'paused') await scheduler.wake(recovered.id)
      }
    },
    create: async (goal, scope) => {
      const mission = await deps.manager.create(goal, scope)
      const activeMissions = (await deps.manager.list(scope)).filter(
        candidate => !isMissionFinished(candidate.state),
      ).length
      deps.metrics?.concurrency(activeMissions)
      const planned = await deps.manager.update(mission.id, mission.revision, current =>
        addMissionStep(
          current,
          createMissionStep(current.id, 'Plan mission', { kind: 'reason' }, deps.clock),
          deps.clock.now(),
        ),
      )
      await scheduler.wake(planned.id)
      return (await deps.manager.read(planned.id)) ?? planned
    },
  }
}
