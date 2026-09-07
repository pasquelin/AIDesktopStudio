import type { AccountSummary } from '@shared/domain/account'
import type { AiOverview, OwnModelProfile } from '@shared/domain/aiOverview'
import type { Asset, AssetType } from '@shared/domain/asset'
import type { ExternalFileImport } from '@shared/domain/externalFile'
import type { FolderRole } from '@shared/domain/folderRole'
import type { AuthState } from '@shared/domain/settings'
import type { MediaCapabilities } from '@shared/domain/media'
import type { TaskWatch } from '@shared/domain/taskProgress'
import type { PathKind } from '@shared/domain/settingsRegistry'
import type { Language } from '@shared/i18n'
import type { AssistantBrain } from './assistant/brainPort'
import type { AutoCaption, DescribeAssets } from './assets/autoCaption'
import type { CloudBackend } from './assets/cloudBackend'
import type { LocalBackend } from './assets/localBackend'
import type { TextureExtraction } from './assets/textureExtraction'
import type { BundleClient } from './bundle/bundleClient'
import type { DictationSession } from './dictation/session'
import type { FavoritesStore } from './favorites/store'
import type { FolderReader } from './project/folder'
import type { McpControl } from './mcp/control'
import type { McpLaunch } from './mcp/endpoint'
import type { RemoteActions } from './mcp/asking'
import type { MediaService } from './media/service'
import type { ActivityLog } from './project/activityLog'
import type { ProjectContextStore } from './project/context'
import type { DocumentFiles } from './project/documents'
import type { FileOps } from './project/fileOps'
import type { ProjectGameStore } from './project/game'
import type { GameScriptStore } from './project/gameScripts'
import type { AnimationGraphStore } from './project/animationGraphs'
import type { InputMapStore } from './project/inputMaps'
import type { Reconciler } from './project/reconcile'
import type { ProjectStore } from './project/store'
import type { ClientProvider } from './provider/client'
import type { CostEstimator } from './provider/cost'
import type { CreditsReader } from './provider/credits'
import type { JobManager } from './provider/jobManager'
import type { ModelRegistry } from './provider/modelRegistry'
import type { OwnerScope } from './provider/ownerScope'
import type { PlanReader } from './provider/plan'
import type { PromptAssist } from './provider/promptAssist'
import type { PromptContext } from './provider/promptContext'
import type { RemoteAssetCatalog } from './provider/assetCatalog'
import type { UsageReader } from './provider/usage'
import type { AssetUploader } from './provider/uploader'
import type { MemoryHost } from './memory/memoryHost'
import type { MemoryVectors } from './memory/memoryVectors'
import type { NewsService } from './news/newsStore'
import type { Said } from './assistant/said'
import type { Transcript } from './assistant/transcript'
import type { SettingsStore } from './settings/store'
import type { StylesStore } from './styles/store'
import type { Updates } from './updater'
import type { AiManager } from './ai/manager'
import type { AskUser } from './project/documentDialogs'
import type { AutoRigHost } from './ai/autoRigHost'
import type { SmartSelectionHost } from './ai/smartSelectionHost'
import type { MissionManager } from './mission/manager'
import type { StudioEventBus } from './mission/eventBus'
import type { ActionSearchService } from './actionIndex/actionSearchService'
import type { AssistantContextBuilder } from './mission/contextBuilder'
import type { VisualCapturePort } from './mission/visualCapture'
import type { MissionRuntime } from './mission/runtime'

export type Services = {
  missions: MissionManager
  missionRuntime: MissionRuntime
  studioEvents: StudioEventBus
  settings: SettingsStore
  client: ClientProvider
  models: ModelRegistry
  jobs: JobManager
  prompts: PromptAssist
  /** What every stored key spent. Consumption only — the API exposes no balance to read. */
  usage: UsageReader
  /** Which models the account's plan may run, so the picker refuses one before the API does. */
  plan: PlanReader
  /** What each stored key has LEFT. See `credits.ts`. */
  credits: CreditsReader
  /** What a run would cost, asked before it is run. See `cost.ts`. */
  estimateCost: CostEstimator
  /** The open project's context, joined to what a generation sends. See `promptContext.ts`. */
  promptContext: PromptContext
  /**
   * Runs the resolved ffmpeg with those arguments. Exposed because a render encodes too, and a
   * second resolver is how two flows start disagreeing about which binary this machine has.
   */
  encodeVideo: (args: readonly string[], signal?: AbortSignal) => Promise<void>
  /** Names what arrives without a useful name. Never throws, never blocks its caller. */
  captionArrivals: AutoCaption
  /** Names a chosen selection, whatever it is already called. */
  describeAssets: DescribeAssets
  uploads: AssetUploader
  /** The library, as the studio asks about it. Rebuilt per call: the key may have changed. */
  remote: () => RemoteAssetCatalog
  cloud: () => CloudBackend
  ownerScope: OwnerScope
  /** Drops the file an asset owns, leaving a linked one where it lies. */
  removeAssetFile: (asset: Asset, expectedProjectPath?: string) => Promise<void>
  project: ProjectStore
  /** What the assistant has learned — the open project's, and the machine's own. */
  memory: MemoryHost
  /** The embeddings of both memories, and the one process that computes them. */
  memoryVectors: MemoryVectors
  /** Reconstructible action retrieval, backed by SQLite outside the UI thread. */
  actionIndex: ActionSearchService
  /** Settles retrieval consumers before closing their shared embedding process. */
  closeRetrieval: () => Promise<void>
  /** Rebuilds a typed, bounded context for one mission step. */
  assistantContext: AssistantContextBuilder
  /** Recipes worth keeping, held outside every project — see `favorites/store.ts`. */
  favorites: FavoritesStore
  /** Saved ways of reading a material, held outside every project — see `styles/store.ts`. */
  styles: StylesStore
  /** What the studio did, and what it failed to do — the surface it had none of. */
  journal: ActivityLog
  /** The WHOLE of what the assistant sent and read back — see `assistant/transcript.ts`. */
  transcribe: Transcript
  /** What the last prompts carried, for a reader who unfolds one — see `assistant/said.ts`. */
  said: Said
  /** Settles the note of what is still running. Awaited at quit, beside the journal. */
  flushJobs: () => Promise<void>
  flushMissions: () => Promise<void>
  documents: DocumentFiles
  assets: LocalBackend
  /**
   * A model's pictures, taken out into the project. Published because the menu row calls the
   * very same one an import runs on its own — two paths that must never disagree about what a
   * model already has.
   */
  extractTextures: TextureExtraction
  /** Minted here so the collector and the audio editor cannot name assets differently. */
  newAssetId: () => string
  media: MediaService
  /** Works out what a sentence said to the studio meant. Decides nothing and runs nothing. */
  assistant: AssistantBrain
  /**
   * Asking the window in front to run an action that came from outside the application, and
   * waiting for its answer. Held here because two places need the same one: the MCP server,
   * which asks, and the IPC handler, which hears the reply.
   */
  remoteActions: RemoteActions
  visualCapture: VisualCapturePort
  /** The MCP server, off unless the setting says otherwise. Followed from `index.ts`. */
  mcp: McpControl
  /** How a client spawns this application as its way in. No address, so it never goes stale. */
  mcpLaunch: McpLaunch
  /** Which AI serves each role, what the machine holds, and what may be installed. */
  ai: AiManager
  autoRig: AutoRigHost
  smartSelection: SmartSelectionHost
  /** Rank 3's gesture, whole: a picker, a GGUF header, an entry. Rejects on a file it cannot read. */
  addOwnAiModel: (profile?: OwnModelProfile, watch?: TaskWatch) => Promise<AiOverview>
  /** Speaking instead of typing. Holds the engine, the model and the state of a session. */
  dictation: DictationSession
  /**
   * Lets the local AI engine go, with the door it started.
   *
   * Beside `dictation` and for the same reason: a `utilityProcess` dies with the app, a spawned
   * interpreter does not. Its worker holds gigabytes of device memory, and nothing on the machine
   * gives them back — the SIGTERM handler written into `core/supervisor.py` never fires unless
   * somebody sends the signal.
   */
  disposeAiEngine: () => Promise<void>
  /** Opens the system screen where microphone access is granted back after a refusal. */
  openMicrophoneSettings: () => void
  /** Links a file into the open project — id, timestamp and catalogue row in one move. */
  link: (source: string, type: AssetType) => Promise<Asset>
  /** The same for a file the project already holds, `null` when nothing here opens it. */
  adopt: (relative: string) => Promise<Asset | null>
  importPaths: (
    paths: readonly string[],
    folder: string,
    watch: TaskWatch,
  ) => Promise<ExternalFileImport>
  claimExternalFiles: (id: string) => readonly string[]
  capabilities: () => Promise<MediaCapabilities>
  /** The language in force. Injected where it is needed, so no module reads the source itself. */
  language: () => Language
  pickPath: (kind: PathKind) => Promise<string | null>
  savePicture: (name: string, bytes: Uint8Array) => Promise<string | null>
  pickSavePath: (name: string, extension: string) => Promise<string | null>
  /** Where a folder the studio is about to fill goes — an exported texture is several files. */
  pickFolder: () => Promise<string | null>
  /** The catalogue's rows for those ids — what an export follows to find an asset's file. */
  assetsById: (ids: readonly string[]) => Promise<readonly Asset[]>
  /** Where the runtime an exported game embeds sits, beside the app. */
  runtimeFolder: () => string
  /** The process that packs and unpacks a montage bundle, forked on the first one asked for. */
  bundles: () => BundleClient
  /** Where a bundle is read FROM. A file the user pointed at, so nothing confines it. */
  pickImportPath: (extension: string) => Promise<string | null>
  /** Where the open project sits, or nothing when none is — what confines an export by name. */
  projectPath: () => string | null
  /** Shows a file in the OS file manager, so the path never leaves this process. */
  reveal: (file: string) => void
  /** Whether a path is still there — `reveal` above answers nothing for one that has gone. */
  exists: (path: string) => boolean
  /** The project folder, read one level at a time. */
  folder: FolderReader
  /** The pass that puts the catalogue and the project folder back in agreement. */
  reconciler: Reconciler
  /** The project's own context, read off the disk on every ask. */
  context: ProjectContextStore
  /**
   * Everything that WRITES to the project folder, and the stack that takes a batch back.
   *
   * One orchestrator for all of them: disk, then journal, then catalogue, in that order and no
   * other. A rename reaching the disk through a second door is a rename the journal never hears
   * about — which is why the two asset renames live in there rather than here.
   */
  files: FileOps
  game: ProjectGameStore
  scripts: GameScriptStore
  inputMaps: InputMapStore
  animationGraphs: AnimationGraphStore
  /** Hands a file to the system. The one place the studio launches a third-party application. */
  openInSystem: (file: string) => Promise<string>
  /** Asks the user a question the OS puts in front of the window — see `documentDialogs`. */
  askUser: AskUser
  /** Sends a whole project folder to the system's trash, named by its own absolute path. */
  trashFolder: (path: string) => Promise<void>
  /** How many generations have not settled — what closing the project asks about. */
  runningJobCount: () => number
  pickMedia: () => Promise<string[]>
  pickAnimation: () => Promise<string[]>
  folderFor: (role: FolderRole) => Promise<string>
  onCredentialsChanged: () => void
  authState: () => Promise<AuthState>
  broadcastAccounts: (accounts: AccountSummary[]) => void
  updates: Updates
  news: NewsService
}
