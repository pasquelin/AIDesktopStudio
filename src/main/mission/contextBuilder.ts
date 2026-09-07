import type { ActionSearchService } from '@main/actionIndex/actionSearchService'
import type { ActionHit } from '@main/actionIndex/actionIndex'
import { actionSearchScope, availableActionTargets } from '@main/actionIndex/actionSearchContext'
import type { MemoryVectors } from '@main/memory/memoryVectors'
import type { ProjectContextStore } from '@main/project/context'
import type { JobManager } from '@main/provider/jobManager'
import type { Memory, MemoryRef } from '@shared/domain/assistantMemory'
import type { Job } from '@shared/domain/job'
import type { Mission, MissionStep } from '@shared/domain/mission'
import { assistantAction, type ActionResource } from '@shared/domain/assistant'
import { noContext, type ContextState } from '@shared/domain/projectContext'
import type { StudioSnapshot } from '@shared/domain/studioSnapshot'
import type {
  AssistantContext,
  ContextBudgetReport,
  ContextSource,
  MissionContext,
  VisualContext,
  WorkspaceContext,
} from './context'
import {
  CONTEXT_BUDGETS,
  emptyBudgetReport,
  markContentTruncated,
  textWithin,
  withinBudget,
} from './contextBudget'
import { serializedContextLength } from './contextCompaction'
import { assetIdsFromJobResult } from './jobResult'
import { previousResults } from './contextResults'

type AssistantContextRequest = {
  mission: Mission
  step: MissionStep
  request: string
  visual?: boolean
}

export type AssistantContextBuilder = {
  build: (request: AssistantContextRequest) => Promise<AssistantContext>
  searchActions?: (
    request: AssistantContextRequest,
    query: string,
    limit?: number,
  ) => Promise<readonly ActionHit[]>
}

export type AssistantContextBuilderDeps = {
  snapshot: () => Promise<StudioSnapshot | null>
  actions: Pick<ActionSearchService, 'search'>
  memories: Pick<MemoryVectors, 'recall'>
  jobs: Pick<JobManager, 'list'>
  projectContext: Pick<ProjectContextStore, 'read'>
  visual?: (document: StudioSnapshot['documents'][number]) => Promise<VisualContext | null>
}

function rememberedRefs(snapshot: StudioSnapshot | null): readonly MemoryRef[] {
  if (!snapshot) return []
  const active = snapshot.documents.find(document => document.active)
  const refs: MemoryRef[] = []
  if (active) refs.push({ kind: 'document', ref: active.id })
  if (snapshot.selection?.kind === 'node') {
    for (const item of snapshot.selection.items) refs.push({ kind: 'node', ref: item.id })
  }
  return refs
}

function selected<T>(
  report: ContextBudgetReport,
  source: ContextSource,
  values: readonly T[],
  measure?: (value: T) => unknown,
): readonly T[] {
  const bounded = withinBudget(values, CONTEXT_BUDGETS[source], measure)
  const contentTruncated = report[source].contentTruncated
  report[source] = {
    ...bounded.report,
    contentTruncated,
    truncated: bounded.report.truncated || contentTruncated,
  }
  return bounded.values
}

function retrievalQuery(input: AssistantContextRequest): string {
  return [
    ...new Set(
      [textWithin(input.mission.goal, 480), textWithin(input.request, 480)].filter(Boolean),
    ),
  ].join('\n')
}

function availableActionResources(input: AssistantContextRequest): readonly ActionResource[] {
  const resources = new Set<ActionResource>()
  for (const step of input.mission.plan.steps) {
    if (step.state !== 'completed') continue
    if (step.kind === 'job') {
      if (assetIdsFromJobResult(step.result).length > 0) resources.add('projectAssetCandidates')
      continue
    }
    if (step.kind !== 'action') continue
    const descriptor = assistantAction(step.call.action)
    for (const resource of descriptor?.produces ?? []) resources.add(resource)
    const hasReturnedValue = Array.isArray(step.result)
      ? step.result.length > 0
      : step.result !== undefined && step.result !== null
    if (hasReturnedValue) {
      for (const resource of descriptor?.returns ?? []) resources.add(resource)
    }
  }
  return [...resources]
}

function rankedCards(context: ContextState, query: string): ContextState {
  const words = query.toLocaleLowerCase('en').match(/[\p{L}\p{N}_]+/gu) ?? []
  const cards = context.cards
    .map((card, ordinal) => ({
      card,
      ordinal,
      score: words.filter(word =>
        `${card.title} ${card.body}`.toLocaleLowerCase('en').includes(word),
      ).length,
    }))
    .sort((left, right) => right.score - left.score || left.ordinal - right.ordinal)
    .map(entry => entry.card)
  return { ...context, cards }
}

type CollectedContext = {
  actions: readonly ActionHit[]
  memories: readonly Memory[]
  jobs: readonly Job[]
  projectContext: ContextState
  visual?: VisualContext
}

async function collectVisualContext(
  deps: AssistantContextBuilderDeps,
  input: AssistantContextRequest,
  snapshot: StudioSnapshot | null,
): Promise<VisualContext | null> {
  const active = snapshot?.documents.find(document => document.active)
  return input.visual && active && deps.visual ? await deps.visual(active) : null
}

function recallProjectMemories(
  deps: AssistantContextBuilderDeps,
  attached: boolean,
  query: string,
  refs: readonly MemoryRef[],
): Promise<readonly Memory[]> {
  return attached
    ? deps.memories.recall('project', {
        text: query,
        refs,
        limit: CONTEXT_BUDGETS.memories.maxItems,
      })
    : Promise.resolve([])
}

async function collectContext(
  deps: AssistantContextBuilderDeps,
  input: AssistantContextRequest,
  snapshot: StudioSnapshot | null,
): Promise<CollectedContext> {
  const query = retrievalQuery(input)
  const refs = rememberedRefs(snapshot)
  const attached =
    input.mission.projectId !== undefined && snapshot?.project?.path === input.mission.projectId
  const readingProjectContext = attached ? deps.projectContext.read() : Promise.resolve(noContext())
  const readingProjectMemories = recallProjectMemories(deps, attached, query, refs)
  const readingGlobalMemories = deps.memories.recall('global', {
    text: query,
    refs,
    limit: CONTEXT_BUDGETS.memories.maxItems,
  })
  const readingVisual = collectVisualContext(deps, input, snapshot)
  const readProjectContext = await readingProjectContext
  const [actions, projectMemories, globalMemories, jobs, visual] = await Promise.all([
    deps.actions.search(
      query,
      CONTEXT_BUDGETS.actions.maxItems,
      availableActionResources(input),
      actionSearchScope(
        snapshot,
        input.request,
        availableActionTargets(readProjectContext, input.request),
      ),
    ),
    readingProjectMemories,
    readingGlobalMemories,
    Promise.resolve(deps.jobs.list()),
    readingVisual,
  ])
  return {
    actions,
    memories: [
      ...new Map(
        [...projectMemories, ...globalMemories].map(memory => [memory.id, memory]),
      ).values(),
    ],
    jobs,
    projectContext: rankedCards(readProjectContext, query),
    ...(visual ? { visual } : {}),
  }
}

function visualContext(collected: CollectedContext, report: ContextBudgetReport) {
  const accepted =
    collected.visual && collected.visual.bytes.byteLength <= (CONTEXT_BUDGETS.visual.maxBytes ?? 0)
      ? [collected.visual]
      : []
  report.visual = {
    ...report.visual,
    considered: collected.visual ? 1 : 0,
    selected: accepted.length,
    truncated: collected.visual !== undefined && accepted.length === 0,
  }
  return accepted
}

function relevantJobs(
  input: AssistantContextRequest,
  jobs: readonly Job[],
  includeActive: boolean,
): readonly Job[] {
  const ids = new Set([
    ...input.mission.waits.flatMap(wait => (wait.kind === 'job' ? [wait.jobId] : [])),
    ...input.mission.plan.steps.flatMap(step => (step.kind === 'job' ? [step.jobId] : [])),
  ])
  const linked = jobs.filter(job => ids.has(job.id))
  if (!includeActive) return linked
  return [
    ...linked,
    ...jobs.filter(
      job => !ids.has(job.id) && (job.status === 'queued' || job.status === 'running'),
    ),
  ]
}

function missionContext(
  input: AssistantContextRequest,
  report: ContextBudgetReport,
): MissionContext {
  const step = {
    id: input.step.id,
    title: textWithin(input.step.title, 160),
    kind: input.step.kind,
    state: input.step.state,
    dependsOn: input.step.dependsOn.slice(0, 12),
    ...(input.step.kind === 'action' ? { actionName: input.step.call.action } : {}),
    ...(input.step.kind === 'job' ? { jobId: input.step.jobId } : {}),
    ...(input.step.kind === 'sub_mission' ? { childMissionId: input.step.childMissionId } : {}),
  }
  const context = selected(report, 'mission', [
    {
      id: input.mission.id,
      goal: textWithin(input.mission.goal, 480),
      state: input.mission.state,
      revision: input.mission.revision,
      step,
      request: textWithin(input.request, 480),
    },
  ])[0]
  if (
    input.mission.goal.length > 480 ||
    input.request.length > 480 ||
    input.step.title.length > 160 ||
    input.step.dependsOn.length > 12
  ) {
    markContentTruncated(report, 'mission')
  }
  if (!context) throw new Error('mission context exceeds its own budget')
  return context
}

function workspaceContext(
  snapshot: StudioSnapshot | null,
  report: ContextBudgetReport,
): WorkspaceContext | null {
  if (!snapshot) return null
  const armedModels = Object.fromEntries(
    Object.entries(snapshot.armedModels).flatMap(([role, model]) =>
      model === undefined ? [] : [[role, textWithin(model, 120)]],
    ),
  )
  const tasks = snapshot.tasks.slice(0, 4).map(task => ({
    ...task,
    label: textWithin(task.label, 80),
  }))
  const base = {
    workspace: snapshot.workspace,
    surface: snapshot.surface,
    commandScope: snapshot.commandScope,
    armedModels,
    play: snapshot.play,
    tasks,
    authenticated: snapshot.authenticated,
    authKnown: snapshot.authKnown,
  }
  const documents = workspaceDocuments(snapshot, base)
  const context = selected(report, 'workspace', [{ ...base, documents }])[0] ?? null
  if (workspaceContentWasTruncated(snapshot, tasks.length, documents.length)) {
    markContentTruncated(report, 'workspace')
  }
  return context
}

function workspaceDocuments(
  snapshot: StudioSnapshot,
  base: Omit<WorkspaceContext, 'documents'>,
): WorkspaceContext['documents'][number][] {
  const documents: WorkspaceContext['documents'][number][] = []
  for (const document of snapshot.documents.slice(0, 8)) {
    const next = {
      id: document.id,
      title: textWithin(document.title, 80),
      kind: document.kind,
      active: document.active,
    }
    if (
      serializedContextLength({ ...base, documents: [...documents, next] }) >
      CONTEXT_BUDGETS.workspace.maxCharacters
    ) {
      break
    }
    documents.push(next)
  }
  return documents
}

function workspaceContentWasTruncated(
  snapshot: StudioSnapshot,
  taskCount: number,
  documentCount: number,
): boolean {
  return (
    snapshot.tasks.length > taskCount ||
    snapshot.tasks.some(task => task.label.length > 80) ||
    snapshot.documents.length > documentCount ||
    snapshot.documents.some(document => document.title.length > 80) ||
    Object.values(snapshot.armedModels).some(model => (model?.length ?? 0) > 120)
  )
}

function snapshotContext(snapshot: StudioSnapshot | null, report: ContextBudgetReport) {
  const document = selected(
    report,
    'document',
    snapshot?.documents.filter(one => one.active) ?? [],
  )[0]
  const project = selected(report, 'project', snapshot?.project ? [snapshot.project] : [])[0]
  const items = selected(report, 'selection', snapshot?.selection?.items ?? [])
  const selection =
    snapshot?.selection && items.length > 0
      ? { ...snapshot.selection, items: [...items] }
      : undefined
  return { document, project, selection, workspace: workspaceContext(snapshot, report) }
}

function projectContext(
  collected: CollectedContext,
  report: ContextBudgetReport,
): AssistantContext['projectContext'] {
  const cards = selected(
    report,
    'projectContext',
    collected.projectContext.cards.filter(card => card.active),
  )
  return cards.length > 0 || collected.projectContext.trouble
    ? { cards, trouble: collected.projectContext.trouble }
    : undefined
}

function assembledContext(
  input: AssistantContextRequest,
  snapshot: StudioSnapshot | null,
  collected: CollectedContext,
): AssistantContext {
  const report = emptyBudgetReport()
  const current = snapshotContext(snapshot, report)
  const context = projectContext(collected, report)
  const visual = visualContext(collected, report)
  return {
    mission: missionContext(input, report),
    workspace: current.workspace,
    project: current.project ?? null,
    ...(current.document ? { document: current.document } : {}),
    ...(current.selection ? { selection: current.selection } : {}),
    actions: selected(report, 'actions', collected.actions, hit => ({
      name: hit.action.name,
      score: hit.score,
    })),
    memories: selected(report, 'memories', collected.memories),
    jobs: selected(report, 'jobs', relevantJobs(input, collected.jobs, snapshot !== null)),
    previousResults: selected(report, 'results', previousResults(input, report)),
    ...(context ? { projectContext: context } : {}),
    ...(visual.length > 0 ? { visual } : {}),
    budget: report,
  }
}

export function createAssistantContextBuilder(
  deps: AssistantContextBuilderDeps,
): AssistantContextBuilder {
  const snapshotFor = async (input: AssistantContextRequest): Promise<StudioSnapshot | null> => {
    if (input.step.missionId !== input.mission.id) {
      throw new Error('context step belongs to another mission')
    }
    const snapshot = await deps.snapshot()
    return input.mission.projectId && snapshot?.project?.path !== input.mission.projectId
      ? null
      : snapshot
  }

  return {
    build: async input => {
      const snapshot = await snapshotFor(input)
      const collected = await collectContext(deps, input, snapshot)
      return assembledContext(input, snapshot, collected)
    },
    searchActions: async (input, query, limit = CONTEXT_BUDGETS.actions.maxItems) => {
      const snapshot = await snapshotFor(input)
      const context =
        input.mission.projectId && snapshot?.project?.path === input.mission.projectId
          ? await deps.projectContext.read()
          : noContext()
      return await deps.actions.search(
        query,
        limit,
        availableActionResources(input),
        actionSearchScope(snapshot, input.request, availableActionTargets(context, input.request)),
      )
    },
  }
}
