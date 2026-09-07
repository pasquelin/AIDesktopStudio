import { MEMORY_ANSWERING_STATES } from '@shared/domain/assistantMemory'
import { vi } from 'vitest'
import type { ActionName } from '@shared/domain/assistant'
import { describeStudio } from '@main/assistant/studioState'
import { parseSnapshot } from '@main/assistant/validation'
import { runAction, runConfirmedAction } from '@/features/assistant/executor'
import { forgetDocumentHistoriesForTests } from '@/stores/documentStore'
import { frontDocumentIn, useDocuments } from '@/stores/documents'
import { playReportOf, usePlay } from '@/stores/play'
import { sceneOf, useScenes } from '@/stores/scenes'
import { useJobs } from '@/stores/jobs'
import { useProject } from '@/stores/project'
import { unsavedDocumentIds } from '@/features/shell/documentIo'
import { projectName } from '@shared/domain/project'
import type { PaintedCells } from './canvasSurface'
import type { StudioBridgeContext } from './studioBridge'
import type { Studio } from './studioContract'

export type StudioRuntime = {
  references: string[]
  refusals: string[]
  poses: Map<string, string>
  settled: Set<string>
  painted: PaintedCells
}

function settleStudio(context: StudioBridgeContext, runtime: StudioRuntime): void {
  context.ops.forget()
  forgetDocumentHistoriesForTests()
  runtime.settled = new Set(unsavedDocumentIds())
  runtime.refusals.length = 0
  runtime.poses.clear()
  for (const document of Object.values(useDocuments.getState().documents)) {
    if (document.kind !== 'scene') continue
    for (const node of sceneOf(useScenes.getState(), document.id).nodes) {
      runtime.poses.set(node.id, JSON.stringify(node.transform))
    }
  }
}

function closeStudio(context: StudioBridgeContext, cleanups: readonly (() => void)[]): void {
  for (const documentId of Object.keys(useDocuments.getState().documents)) {
    usePlay.getState().stop(documentId)
  }
  for (const cleanup of cleanups) cleanup()
  context.memory.close()
  vi.unstubAllGlobals()
}

export function studioFacade(
  context: StudioBridgeContext,
  runtime: StudioRuntime,
  cleanups: readonly (() => void)[],
): Studio {
  const { folder, catalog, ops, cloud, git, shell, memory, game } = context
  const run = async (action: ActionName, input: Record<string, unknown>) => {
    const outcome = await runConfirmedAction(action, input)
    if (!outcome.ok) runtime.refusals.push(`${action} ${outcome.refusal}`)
    return outcome
  }
  const studio: Studio = {
    run,
    state: async () => {
      const read = await runAction('studio.state', {})
      return read.ok ? describeStudio(read.data) : ''
    },
    snapshot: async () => {
      const read = await runAction('studio.state', {})
      const snapshot = read.ok ? parseSnapshot(read.data) : null
      if (!snapshot) throw new Error('studio.state did not return a snapshot')
      return snapshot
    },
    documents: () => Object.values(useDocuments.getState().documents),
    front: () => {
      const { activeId, documents } = useDocuments.getState()
      return activeId === null ? null : (documents[activeId] ?? null)
    },
    files: () => folder.paths(),
    game: () => game.current,
    assets: () => catalog.rows(),
    jobs: () => useJobs.getState().jobs,
    painted: () => runtime.painted,
    references: () => runtime.references,
    git,
    shell,
    projectName: () => {
      const open = useProject.getState().project
      return open ? projectName(open.path) : ''
    },
    familyOf: cloud.familyOf,
    sentBodies: () => useJobs.getState().bodies,
    changed: () => unsavedDocumentIds().some(one => !runtime.settled.has(one)) || ops.can().undo,
    refusals: () => runtime.refusals,
    memories: memory.held,
    answeringMemories: () =>
      memory.held().filter(one => MEMORY_ANSWERING_STATES.includes(one.state)).length,
    projectContext: () => shell.context(),
    playing: async () => {
      for (let tries = 0; tries < 200; tries++) {
        if (studio.playState() !== 'edit') return true
        await new Promise(settle => setTimeout(settle, 10))
      }
      return false
    },
    playState: () => {
      const documentId = frontDocumentIn(useDocuments.getState(), '3d')
      return documentId === null ? 'edit' : playReportOf(usePlay.getState(), documentId).state
    },
    wasAt: nodeId => runtime.poses.get(nodeId) ?? null,
    settle: () => settleStudio(context, runtime),
    close: () => closeStudio(context, cleanups),
  }
  return studio
}
