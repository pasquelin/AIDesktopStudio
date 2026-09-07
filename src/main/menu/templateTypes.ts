import type { RecentDocument, RecentProject } from '@shared/domain/project'
import type { ToolId, ToolSurface } from '@shared/domain/tool'
import type {
  BindingOverrides,
  CommandId,
  CommandScope,
  MenuAbility,
  MenuCheck,
} from '@shared/domain/command'
import type { Language } from '@shared/i18n'
import type { NavigationPreset } from '@shared/domain/navigationPreset'
import type {
  MaterialExportCommand,
  NewDocumentRequest,
  RecentOpenRequest,
  SceneAddRequest,
  SceneCaptureCommand,
  SceneDisplayRequest,
  SceneExportCommand,
  SkyboxExportCommand,
  ToolRequest,
} from '@shared/ipc'

export type MenuActions = {
  setNavigationPreset: (preset: NavigationPreset) => void
  openSettings: () => void
  openLicences: () => void
  openManual: () => void
  openUsage: () => void
  openWelcome: () => void
  toggleFullScreen: () => void
  openTool: (request: ToolRequest) => void
  runCommand: (command: CommandId) => void
  newDocument: (request: NewDocumentRequest) => void
  openRecent: (request: RecentOpenRequest) => void
  addNode: (request: SceneAddRequest) => void
  setDisplay: (request: SceneDisplayRequest) => void
  exportScene: (command: SceneExportCommand) => void
  captureScene: (command: SceneCaptureCommand) => void
  exportMaterial: (command: MaterialExportCommand) => void
  exportSkybox: (command: SkyboxExportCommand) => void
}

export type MenuOptions = {
  language: Language
  workspace: ToolSurface | null
  scope: CommandScope | null
  tools: readonly ToolId[]
  isMac: boolean
  isDevelopment: boolean
  checked: readonly MenuCheck[]
  navigationPreset: NavigationPreset
  abilities: readonly MenuAbility[]
  openProject: string | null
  recentProjects: readonly RecentProject[]
  recentDocuments: readonly RecentDocument[]
  overrides: BindingOverrides
  actions: MenuActions
}
