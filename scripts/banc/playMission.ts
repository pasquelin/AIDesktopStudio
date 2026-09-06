import type { ActionName, ActionOutcome, AssistantCall } from '@shared/domain/assistant'
import type { Mission, MissionClock } from '@shared/domain/mission'
import type { StudioSnapshot } from '@shared/domain/studioSnapshot'
import { createActionFinder, type ActionSearchService } from '@main/actionIndex/actionSearchService'
import type { AssistantBrain } from '@main/assistant/brainPort'
import { describeStudio } from '@main/assistant/studioState'
import {
  createAssistantContextBuilder,
  type AssistantContextBuilder,
} from '@main/mission/contextBuilder'
import { createStudioEventBus } from '@main/mission/eventBus'
import type { MissionJournal } from '@main/mission/journal'
import { createMissionManager, type MissionManager } from '@main/mission/manager'
import {
  createMissionMetrics,
  type MissionMetrics,
  type MissionRuntimeMetrics,
} from '@main/mission/metrics'
import { createMissionRuntime, type MissionRuntime } from '@main/mission/runtime'
import { createMissionRevisionReader } from '@main/mission/resourceState'
import { createMissionStore } from '@main/mission/store'
import { PROJECT } from './project'
import type { Called, Run, Scenario } from './run'
import { createStudio } from './studio'
import type { Studio } from './studioContract'
import { createMissionTraceRecorder, type MissionTraceRecorder } from './missionTrace'

export type MissionRun = Run & {
  rounds: number
  metrics: MissionRuntimeMetrics
  /** Every action any reflection offered the model — what the retrieval is judged on. */
  candidates: ReadonlySet<ActionName>
  missions: readonly Mission[]
  traceFile?: string
}

type MissionTraceOptions = { folder: string; scenarioId: string; runId: number }

function clock(): MissionClock {
  let sequence = 0
  return {
    now: () => new Date().toISOString(),
    newId: () => `${Date.now()}_${(sequence += 1)}`,
  }
}

const memoryJournal = (): MissionJournal => ({
  read: async () => [],
  append: async () => {},
  flush: async () => {},
})

const answersOf = (missions: readonly Mission[]): { said: string; asks: readonly string[] } => {
  const answers = missions.flatMap(mission =>
    mission.plan.steps.flatMap(step =>
      typeof step.result === 'object' && step.result !== null ? [step.result] : [],
    ),
  )
  return {
    said: answers
      .flatMap(answer => ('say' in answer && typeof answer.say === 'string' ? [answer.say] : []))
      .join('\n'),
    asks: answers.flatMap(answer => {
      if (!('ask' in answer) || typeof answer.ask !== 'object' || answer.ask === null) return []
      if (!('questions' in answer.ask) || !Array.isArray(answer.ask.questions)) return []
      return answer.ask.questions.flatMap(question =>
        typeof question === 'object' &&
        question !== null &&
        'question' in question &&
        typeof question.question === 'string'
          ? [question.question]
          : [],
      )
    }),
  }
}

/**
 * What `createRoutedBrain` adds in the product before any door — the state in front and the
 * memory count. A bench that omitted them measured a briefing the studio never sends. The state
 * is described from the snapshot the context builder just took, not read a second time.
 */
function tracedBrain(
  think: AssistantBrain['think'],
  recorder: MissionTraceRecorder | null,
  studio: Studio,
  latest: () => StudioSnapshot | null,
): AssistantBrain {
  return {
    capabilities: async () => ({ streaming: false, structuredJson: true, multimodalImages: false }),
    window: async () => null,
    think: async (packed, watch) => {
      const request = {
        ...packed,
        state: describeStudio(latest()),
        memories: studio.answeringMemories(),
      }
      const reflection = recorder?.beginReflection(request)
      try {
        const answer = await think(request, {
          ...watch,
          onNote: note => {
            if (reflection) recorder?.note(reflection, note)
            watch?.onNote?.(note)
          },
        })
        if (reflection) recorder?.completeReflection(reflection, answer)
        return answer
      } catch (error) {
        if (reflection) recorder?.failReflection(reflection, error)
        throw error
      }
    },
  }
}

function tracedContext(
  studio: Studio,
  actions: Pick<ActionSearchService, 'search'>,
  recorder: MissionTraceRecorder | null,
  offered: Set<ActionName>,
): AssistantContextBuilder & {
  latest: () => StudioSnapshot | null
  search: ActionSearchService['search']
} {
  let snapshot: StudioSnapshot | null = null
  let retrieval: {
    query: string
    available: NonNullable<Parameters<typeof actions.search>[2]>
    scope: NonNullable<Parameters<typeof actions.search>[3]>
    candidates: Awaited<ReturnType<typeof actions.search>>
  } = {
    query: '',
    available: [],
    scope: {} as NonNullable<Parameters<typeof actions.search>[3]>,
    candidates: [] as Awaited<ReturnType<typeof actions.search>>,
  }
  const search: ActionSearchService['search'] = async (query, limit, available, scope) => {
    const candidates = await actions.search(query, limit, available, scope)
    for (const hit of candidates) offered.add(hit.action.name)
    retrieval = { query, available: available ?? [], scope: scope ?? {}, candidates }
    return candidates
  }
  const builder = createAssistantContextBuilder({
    snapshot: async () => (snapshot = await studio.snapshot()),
    actions: { search },
    memories: { recall: async () => studio.memories() },
    jobs: { list: () => [...studio.jobs()] },
    projectContext: { read: async () => studio.projectContext() },
  })
  return {
    build: async request => {
      const context = await builder.build(request)
      recorder?.context(request.mission.id, request.step.id, { ...retrieval, snapshot })
      return context
    },
    searchActions: builder.searchActions,
    latest: () => snapshot,
    search,
  }
}

/**
 * `actions.find` goes to the index, as `createRemoteActions` sends it in the product. Left to the
 * studio it ran the window's `findActions` — English names alone, a second search engine the
 * bench measured without knowing.
 */
function tracedActions(
  studio: Studio,
  find: (query: unknown) => Promise<ActionOutcome>,
  called: Called[],
  recorder: MissionTraceRecorder | null,
) {
  return {
    run: async (call: AssistantCall) => {
      let outcome
      try {
        outcome =
          call.action === 'actions.find'
            ? await find(call.input['query'])
            : await studio.run(call.action, call.input)
      } catch (error) {
        recorder?.actionError(call, error)
        throw error
      }
      recorder?.action(call, outcome)
      called.push({
        action: call.action,
        input: call.input,
        answer: outcome.ok
          ? outcome.data === undefined
            ? 'ok'
            : `ok ${JSON.stringify(outcome.data)}`
          : `refused ${outcome.refusal}${outcome.detail === undefined ? '' : ` (${outcome.detail})`}`,
      })
      return outcome
    },
    settle: () => {},
  }
}

async function projectScope(studio: Studio): Promise<{ projectId?: string }> {
  const projectId = (await studio.snapshot()).project?.path
  return projectId ? { projectId } : {}
}

async function writeFailure(
  recorder: MissionTraceRecorder | null,
  manager: MissionManager,
  studio: Studio,
): Promise<void> {
  if (!recorder) return
  try {
    recorder.write(await manager.list({}), await studio.snapshot())
  } catch {
    recorder.write([])
  }
}

function completedRun(
  studio: Studio,
  called: readonly Called[],
  metrics: MissionMetrics,
  missions: readonly Mission[],
  candidates: ReadonlySet<ActionName>,
  traceFile?: string,
): MissionRun {
  const response = answersOf(missions)
  return {
    studio,
    called,
    refused: called.filter(call => call.answer?.startsWith('refused')).length,
    said: response.said,
    asks: response.asks,
    rounds: metrics.read().llmCalls,
    metrics: metrics.read(),
    candidates,
    missions,
    ...(traceFile ? { traceFile } : {}),
  }
}

/** The person answering the model's questions, one scripted reply per question. */
async function answerQuestions(
  runtime: MissionRuntime,
  manager: MissionManager,
  mission: Mission,
  replies: readonly string[],
): Promise<void> {
  let current = mission
  for (const reply of replies) {
    const wait = current.waits.find(one => one.kind === 'user')
    if (!wait) return
    await runtime.scheduler.resume(current.id, wait.stepId, reply)
    current = (await manager.read(current.id)) ?? current
  }
}

export async function playMission(
  scenario: Scenario,
  think: AssistantBrain['think'],
  actions: Pick<ActionSearchService, 'search'>,
  traceOptions?: MissionTraceOptions,
): Promise<MissionRun> {
  const called: Called[] = [],
    metrics = createMissionMetrics(),
    offered = new Set<ActionName>()
  const studio = await createStudio(PROJECT, undefined, scenario.answers)
  const recorder = traceOptions
    ? createMissionTraceRecorder({ ...traceOptions, userRequest: scenario.said })
    : null
  const time = clock()
  const manager = createMissionManager(
    createMissionStore(memoryJournal()),
    createStudioEventBus(),
    time,
  )
  const context = tracedContext(studio, actions, recorder, offered)
  const find = createActionFinder({
    search: context.search,
    snapshot: async () => context.latest() ?? (await studio.snapshot()),
  })
  const runtime = createMissionRuntime({
    manager,
    context,
    brain: tracedBrain(think, recorder, studio, context.latest),
    actions: tracedActions(studio, find, called, recorder),
    jobs: { list: () => [...studio.jobs()] },
    revisions: createMissionRevisionReader(async () => await studio.snapshot()),
    clock: time,
    metrics,
  })

  try {
    await scenario.setup?.(studio)
    studio.settle()
    const scope = await projectScope(studio)
    for (const request of scenario.said) {
      const mission = await runtime.create(request, scope)
      await answerQuestions(runtime, manager, mission, scenario.replies ?? [])
    }
    const missions = await manager.list(scope)
    const traceFile = recorder?.write(missions, await studio.snapshot())
    return completedRun(studio, called, metrics, missions, offered, traceFile)
  } catch (error) {
    await writeFailure(recorder, manager, studio)
    studio.close()
    throw error
  }
}
