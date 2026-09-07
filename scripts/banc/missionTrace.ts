import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  AssistantAnswer,
  AssistantCall,
  AssistantThought,
  ActionOutcome,
  ActionResource,
} from '@shared/domain/assistant'
import type { AssistantNote } from '@shared/domain/assistantNote'
import type { Mission } from '@shared/domain/mission'
import type { StudioSnapshot } from '@shared/domain/studioSnapshot'
import type { ActionHit } from '@main/actionIndex/actionIndex'

type Retrieval = {
  query: string
  available: readonly ActionResource[]
  scope: { target?: string; document?: string }
  candidates: readonly ActionHit[]
}
type ProviderAttempt = { prompt: string; rawResponse?: string; door: string; model: string }
type TracedAction = AssistantCall & { outcome?: ActionOutcome; executionError?: string }
type ContextEvidence = Retrieval & { snapshot: StudioSnapshot | null }

type MissionReflectionTrace = {
  scenarioId: string
  runId: number
  missionId: string
  stepId: string
  reflection: number
  userRequest: string
  missionGoal: string
  step: unknown
  workspaceState: unknown
  revision: { mission?: number; document?: number }
  contextSerialized: string
  context: unknown
  sources: readonly string[]
  budget: unknown
  actionIndex: Retrieval
  actionsSentToModel: readonly string[]
  memories: unknown
  previousResults: unknown
  providerAttempts: ProviderAttempt[]
  parsedResponse: AssistantAnswer | null
  providerError?: string
  actions: TracedAction[]
  refusals: { action: string; refusal: string; detail?: string }[]
  nextReflection?: {
    reflection: number
    contextSerialized: string
    query: string
    candidates: readonly ActionHit[]
  }
}

type MissionRunTrace = {
  scenarioId: string
  runId: number
  userRequest: readonly string[]
  reflections: MissionReflectionTrace[]
  missions?: readonly Mission[]
  finalSnapshot?: StudioSnapshot
}

export type MissionTraceRecorder = {
  context: (missionId: string, stepId: string, evidence: ContextEvidence) => void
  beginReflection: (request: AssistantThought) => number
  note: (reflection: number, note: AssistantNote) => void
  completeReflection: (reflection: number, answer: AssistantAnswer) => void
  failReflection: (reflection: number, error: unknown) => void
  action: (call: AssistantCall, outcome: ActionOutcome) => void
  actionError: (call: AssistantCall, error: unknown) => void
  write: (missions: readonly Mission[], finalSnapshot?: StudioSnapshot) => string
}

type TraceOptions = {
  folder: string
  scenarioId: string
  runId: number
  userRequest: readonly string[]
}

const recordOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {}

function parsedContext(serialized: string | undefined): unknown {
  if (!serialized) return {}
  try {
    return JSON.parse(serialized)
  } catch {
    return { invalidSerializedContext: serialized }
  }
}

function sourceNames(budget: Record<string, unknown>): readonly string[] {
  return Object.entries(budget).flatMap(([source, report]) => {
    const selected = recordOf(report)['selected']
    return typeof selected === 'number' && selected !== 0 ? [source] : []
  })
}

function reflectionOf(
  options: TraceOptions,
  request: AssistantThought,
  retrieval: Retrieval,
  snapshot: StudioSnapshot | null,
  reflection: number,
): MissionReflectionTrace {
  const context = parsedContext(request.context)
  const root = recordOf(context)
  const mission = recordOf(root['mission'])
  const step = recordOf(mission['step'])
  const budget = recordOf(root['budget'])
  return {
    scenarioId: options.scenarioId,
    runId: options.runId,
    missionId: typeof mission['id'] === 'string' ? mission['id'] : '',
    stepId: typeof step['id'] === 'string' ? step['id'] : '',
    reflection,
    userRequest: request.utterance,
    missionGoal: typeof mission['goal'] === 'string' ? mission['goal'] : '',
    step,
    workspaceState: root['workspace'],
    revision: {
      ...(typeof mission['revision'] === 'number' ? { mission: mission['revision'] } : {}),
      ...(snapshot?.activeDocumentState ? { document: snapshot.activeDocumentState.revision } : {}),
    },
    contextSerialized: request.context ?? '',
    context,
    sources: sourceNames(budget),
    budget,
    actionIndex: retrieval,
    actionsSentToModel: request.candidates ?? [],
    memories: root['memories'],
    previousResults: root['previousResults'],
    providerAttempts: [],
    parsedResponse: null,
    actions: [],
    refusals: [],
  }
}

const safeName = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)

const SENSITIVE_FIELD = /^(authorization|api[-_]?key|secret|access[-_]?token|refresh[-_]?token)$/i

function serializedTrace(trace: MissionRunTrace): string {
  return JSON.stringify(
    trace,
    (key, value: unknown) => (SENSITIVE_FIELD.test(key) ? '[redacted]' : value),
    2,
  )
}

export function createMissionTraceRecorder(options: TraceOptions): MissionTraceRecorder {
  const trace: MissionRunTrace = { ...options, reflections: [] }
  const contexts = new Map<string, ContextEvidence>()
  const pendingActions: TracedAction[] = []
  mkdirSync(options.folder, { recursive: true })
  const file = join(options.folder, `${safeName(options.scenarioId)}-run-${options.runId}.json`)
  const flush = (): void => writeFileSync(file, `${serializedTrace(trace)}\n`, 'utf8')
  flush()

  return {
    context: (missionId, stepId, evidence) => {
      contexts.set(`${missionId}:${stepId}`, evidence)
    },
    beginReflection: request => {
      const reflection = trace.reflections.length + 1
      const parsed = recordOf(parsedContext(request.context))
      const mission = recordOf(parsed['mission'])
      const step = recordOf(mission['step'])
      const evidence = contexts.get(`${mission['id']}:${step['id']}`) ?? {
        query: '',
        available: [],
        scope: {},
        candidates: [],
        snapshot: null,
      }
      const recorded = reflectionOf(options, request, evidence, evidence.snapshot, reflection)
      const previous = [...trace.reflections]
        .reverse()
        .find(entry => entry.missionId === recorded.missionId)
      if (previous) {
        previous.nextReflection = {
          reflection,
          contextSerialized: request.context ?? '',
          query: evidence.query,
          candidates: evidence.candidates,
        }
      }
      trace.reflections.push(recorded)
      flush()
      return reflection
    },
    note: (reflection, note) => {
      const recorded = trace.reflections[reflection - 1]
      if (!recorded) return
      if (note.kind === 'sent') {
        recorded.providerAttempts.push({
          prompt: note.text,
          door: note.door,
          model: note.model,
        })
      } else if (note.kind === 'answered') {
        const attempt = recorded.providerAttempts.at(-1)
        if (attempt) attempt.rawResponse = note.text
      }
      flush()
    },
    completeReflection: (reflection, answer) => {
      const recorded = trace.reflections[reflection - 1]
      if (!recorded) return
      recorded.parsedResponse = answer
      recorded.actions.push(...answer.calls.map(call => ({ ...call })))
      if (!answer.ask) pendingActions.push(...recorded.actions)
      flush()
    },
    failReflection: (reflection, error) => {
      const recorded = trace.reflections[reflection - 1]
      if (!recorded) return
      recorded.providerError = error instanceof Error ? error.message : String(error)
      flush()
    },
    action: (call, outcome) => {
      const pending = pendingActions.find(
        action =>
          action.outcome === undefined &&
          action.action === call.action &&
          JSON.stringify(action.input) === JSON.stringify(call.input),
      )
      if (pending) {
        pending.outcome = outcome
        if (!outcome.ok) {
          const reflection = trace.reflections.find(entry => entry.actions.includes(pending))
          reflection?.refusals.push({
            action: call.action,
            refusal: outcome.refusal,
            ...(outcome.detail ? { detail: outcome.detail } : {}),
          })
        }
        flush()
      }
    },
    actionError: (call, error) => {
      const pending = pendingActions.find(
        action =>
          action.outcome === undefined &&
          action.executionError === undefined &&
          action.action === call.action &&
          JSON.stringify(action.input) === JSON.stringify(call.input),
      )
      if (!pending) return
      pending.executionError = error instanceof Error ? error.message : String(error)
      flush()
    },
    write: (missions, finalSnapshot) => {
      trace.missions = missions
      if (finalSnapshot) trace.finalSnapshot = finalSnapshot
      flush()
      return file
    },
  }
}
