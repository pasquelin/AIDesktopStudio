import type { LocalBackend } from '@main/assets/localBackend'
import type { TextureExtraction } from '@main/assets/textureExtraction'
import type { SettingsStore } from '@main/settings/store'
import type { ActivityReport } from './activityLog'
import type { ProjectContextStore } from './context'
import type { AskUser } from './documentDialogs'
import type { DocumentFiles } from './documents'
import type { FileOps } from './fileOps'
import type { FolderReader } from './folder'
import type { ProjectGameStore } from './game'
import type { GameScriptStore } from './gameScripts'
import type { Reconciler } from './reconcile'
import type { ProjectStore } from './store'

export type ProjectHandlerDeps = {
  project: ProjectStore
  settings: SettingsStore
  record: (entry: ActivityReport) => void
  assets: LocalBackend
  extractTextures: TextureExtraction
  newAssetId: () => string
  documents: DocumentFiles
  reveal: (file: string) => void
  exists: (path: string) => boolean
  folder: FolderReader
  files: FileOps
  reconciler: Reconciler
  context: ProjectContextStore
  game: ProjectGameStore
  scripts: GameScriptStore
  openInSystem: (file: string) => Promise<string>
  askUser: AskUser
  trashFolder: (path: string) => Promise<void>
  runningJobCount: () => number
}
