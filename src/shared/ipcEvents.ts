import type { ActionOutcome, AssistantCall } from './domain/assistant'
import type { DocumentKind } from './domain/document'
import type { Project } from './domain/project'
import type {
  DisplayMode,
  ExportFormat,
  FigureKind,
  LightKind,
  MeshKind,
  ObjectKind,
} from './domain/scene'
import type { CaptureQuality } from './domain/sceneCapture'
import type { ExportTargetId } from './domain/exportRegistry'
import type { MaterialExportTarget } from './domain/materialExport'
import type { ToolId, ToolZone } from './domain/tool'

/** Channels pushed from the main process to the renderer. */
export const EVENTS = {
  memoryChanged: 'evt:memory-changed',
  memoryIndexed: 'evt:memory-indexed',
  jobProgress: 'evt:job-progress',
  jobsChanged: 'evt:jobs-changed',
  mediaProgress: 'evt:media-progress',
  assistantAction: 'evt:assistant-action',
  assistantVisualCapture: 'evt:assistant-visual-capture',
  assistantStream: 'evt:assistant-stream',
  dictation: 'evt:dictation',
  ai: 'evt:ai',
  log: 'evt:log',
  projectChanged: 'evt:project-changed',
  projectFolderChanged: 'evt:project-folder-changed',
  filesChanged: 'evt:files-changed',
  projectJsonWritten: 'evt:project-json-written',
  projectRescan: 'evt:project-rescan',
  projectFolderRoles: 'evt:project-folder-roles',
  projectContext: 'evt:project-context',
  assetsChanged: 'evt:assets-changed',
  settingsChanged: 'evt:settings-changed',
  mcpState: 'evt:mcp-state',
  accountsChanged: 'evt:accounts-changed',
  openTool: 'evt:open-tool',
  menuCommand: 'evt:menu-command',
  windowState: 'evt:window-state',
  windowLanguage: 'evt:window-language',
  documentNew: 'evt:document-new',
  openRecent: 'evt:open-recent',
  sceneAdd: 'evt:scene-add',
  sceneDisplay: 'evt:scene-display',
  sceneExport: 'evt:scene-export',
  sceneCapture: 'evt:scene-capture',
  materialExport: 'evt:material-export',
  skyboxExport: 'evt:skybox-export',
  taskProgress: 'evt:task-progress',
  settingsSection: 'evt:settings-section',
  updateState: 'evt:update-state',
  gameWindowClosed: 'evt:game-window-closed',
  activity: 'evt:activity',
  missionChanged: 'evt:mission-changed',
  missionEvent: 'evt:mission-event',
}

export type Unsubscribe = () => void

/** Request to open a tool, coming from the native menu. */
export type ToolRequest = {
  zone: ToolZone
  tool: ToolId
}

/**
 * Which kind File ▸ New asks the window in front to make. An EVENT rather than a `CommandId`,
 * exactly as `SceneAddRequest` is: eight rows carrying no shortcut of their own would be eight
 * dead entries in the shortcut settings.
 */
export type NewDocumentRequest = { kind: DocumentKind }

/**
 * One row of File ▸ Open recent: a project folder, and the document inside it when the row names
 * one. The two in one shape rather than two events — the gesture is the same, and a document of
 * another project IS a project switch followed by an opening.
 */
export type RecentOpenRequest = { project: string; path?: string }

/** Request to drop a node in the active scene, coming from the native menu. */
export type SceneAddRequest = { kind: MeshKind | LightKind | FigureKind | ObjectKind }

/** Which of the seven ways of drawing the menu asks the scene in front to switch to. */
export type SceneDisplayRequest = { mode: DisplayMode }

/** What the native menu asks of the scene in front: a format, and how much of the scene. */
export type SceneExportCommand = { format: ExportFormat; scope: 'scene' | 'selection' }

/**
 * A still of the view in front, at the definition the menu row names. The picture lands in the
 * project as an ordinary asset — nothing here says where, because the window answers that.
 */
export type SceneCaptureCommand = { quality: CaptureQuality }

/**
 * An action asked for from OUTSIDE the window — today, by an MCP client on the other side of
 * the machine.
 *
 * It travels as a PAIR, because the studio has no single round trip in that direction: `invoke`
 * goes renderer to main, `broadcast` goes back with no reply. So the main process sends this to
 * the window in front, and the window answers on `assistant:action-result` quoting the same
 * `callId`. A call nobody answers in time fails, and says which way it failed.
 */
export type AssistantActionRequest = { callId: string; call: AssistantCall }

export type AssistantActionResult = { callId: string; outcome: ActionOutcome }

export type AssistantVisualCaptureRequest = { callId: string; documentId: string }
export type AssistantVisualCaptureResult = { callId: string; png: Uint8Array | null }

/** What the native menu asks of the texture in front: which engine it is being handed to. */
export type MaterialExportCommand = { target: MaterialExportTarget }

/**
 * What the native menu asks of the sky in front: the six faces at a size, or the one panorama
 * they are cut out of.
 *
 * DISCRIMINATED rather than a size beside an optional target: a size means nothing to a panorama,
 * which leaves at the source's own resolution, and an optional field with an unwritten default is
 * one every consumer reconstructs — differently, once there are three of them.
 */
export type SkyboxExportCommand =
  | { kind: 'faces'; size: number }
  | { kind: 'panorama'; target: Extract<ExportTargetId, 'sky.hdr' | 'sky.exr'> }

/**
 * Where the MCP server is listening, as a window may know it: the port, never the token.
 *
 * No `listening` beside it — it was `port !== null` in both producers, and a second field that
 * can only ever agree is a second field that can one day disagree.
 */
export type McpState = { port: number | null }

/**
 * What `project.create` did with the folder it was handed.
 *
 * 🛑 `made` is false for a folder that WAS already a project: the channel opens it rather than
 * writing over it, so nothing was created and nothing switched away from — which is what the
 * window has to know before it acts as though a new project exists.
 */
export type ProjectMade = { project: Project; made: boolean }

/** How binning a project folder ended — see `project.trash`. */
export type ProjectBinned = 'trashed' | 'missing' | 'not-a-project'
