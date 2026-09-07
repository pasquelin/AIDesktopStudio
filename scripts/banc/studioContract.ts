import type { ActionName, ActionOutcome } from '@shared/domain/assistant'
import type { Memory } from '@shared/domain/assistantMemory'
import type { Asset } from '@shared/domain/asset'
import type { DocumentDescriptor } from '@shared/domain/document'
import type { GameManifest } from '@shared/domain/game'
import type { PlayState } from '@shared/domain/gameRuntime'
import type { Job } from '@shared/domain/job'
import type { ModelFamily } from '@shared/domain/model'
import type { StudioBridge } from '@shared/ipc'
import type { PaintedCells } from './canvasSurface'
import type { MemoryGit } from './memoryGit'
import type { MemoryShell } from './memoryShell'
import type { ContextState } from '@shared/domain/projectContext'
import type { StudioSnapshot } from '@shared/domain/studioSnapshot'

export type Think = StudioBridge['assistant']['think']

export type Studio = {
  run: (action: ActionName, input: Record<string, unknown>) => Promise<ActionOutcome>
  state: () => Promise<string>
  snapshot: () => Promise<StudioSnapshot>
  documents: () => readonly DocumentDescriptor[]
  front: () => DocumentDescriptor | null
  files: () => readonly string[]
  game: () => GameManifest
  assets: () => readonly Asset[]
  jobs: () => readonly Job[]
  git: MemoryGit
  shell: MemoryShell
  projectName: () => string
  painted: () => PaintedCells
  references: () => readonly string[]
  familyOf: (modelId: string) => ModelFamily | null
  sentBodies: () => Record<string, Record<string, unknown>>
  changed: () => boolean
  refusals: () => readonly string[]
  memories: () => readonly Memory[]
  /** The count the briefing carries — what `createRoutedBrain` sends, and nothing else. */
  answeringMemories: () => number
  projectContext: () => ContextState
  playState: () => PlayState
  playing: () => Promise<boolean>
  settle: () => void
  wasAt: (nodeId: string) => string | null
  close: () => void
}
