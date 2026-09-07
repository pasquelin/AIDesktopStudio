import type { ActionHit } from '@main/actionIndex/actionIndex'
import type { AssistantCall } from '@shared/domain/assistant'
import type { Memory } from '@shared/domain/assistantMemory'
import type { Job } from '@shared/domain/job'
import type { Mission, MissionStepKind, MissionStepState } from '@shared/domain/mission'
import type { ContextCard, ContextTrouble } from '@shared/domain/projectContext'
import type {
  SnapshotDocument,
  SnapshotSelection,
  StudioSnapshot,
} from '@shared/domain/studioSnapshot'

export type ContextSource =
  | 'mission'
  | 'workspace'
  | 'project'
  | 'document'
  | 'selection'
  | 'actions'
  | 'memories'
  | 'jobs'
  | 'results'
  | 'projectContext'
  | 'visual'

export type ContextSourceBudget = {
  maxItems: number
  maxCharacters: number
  maxBytes?: number
}

export type ContextSourceReport = ContextSourceBudget & {
  considered: number
  selected: number
  characters: number
  truncated: boolean
  contentTruncated: boolean
}

export type ContextBudgetReport = Record<ContextSource, ContextSourceReport>

export type MissionContext = Pick<Mission, 'id' | 'goal' | 'state' | 'revision'> & {
  step: {
    id: string
    title: string
    kind: MissionStepKind
    state: MissionStepState
    dependsOn: readonly string[]
    actionName?: string
    jobId?: string
    childMissionId?: string
  }
  request: string
}

export type WorkspaceContext = Pick<
  StudioSnapshot,
  | 'workspace'
  | 'surface'
  | 'commandScope'
  | 'armedModels'
  | 'play'
  | 'tasks'
  | 'authenticated'
  | 'authKnown'
> & {
  documents: readonly Pick<SnapshotDocument, 'id' | 'title' | 'kind' | 'active'>[]
}

export type VisualContext = {
  kind: 'viewport' | 'document' | 'camera' | 'preview'
  mimeType: 'image/png' | 'image/jpeg'
  width: number
  height: number
  bytes: Uint8Array
  capturedAt: string
  resourceId?: string
  revision?: number
}

type ProjectContextSlice = {
  cards: readonly ContextCard[]
  trouble: ContextTrouble | null
}

export type AssistantContext = {
  mission: MissionContext
  workspace: WorkspaceContext | null
  project: StudioSnapshot['project']
  document?: SnapshotDocument
  selection?: SnapshotSelection
  actions: readonly ActionHit[]
  memories: readonly Memory[]
  jobs: readonly Job[]
  /** What already ran — the call as it was sent, and what it answered — newest first. */
  previousResults: readonly {
    stepId: string
    title: string
    call?: AssistantCall
    result: unknown
  }[]
  projectContext?: ProjectContextSlice
  visual?: readonly VisualContext[]
  budget: ContextBudgetReport
}
