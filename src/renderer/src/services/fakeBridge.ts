import { vi } from 'vitest'
import type { CloseChoice, DocumentWrite } from '@shared/domain/document'
import { emptyAssetCounts } from '@shared/domain/asset'
import type { FileOutcome } from '@shared/domain/fileOp'
import { DEFAULT_ROLE_PATHS } from '@shared/domain/folderRole'
import { noGame } from '@shared/domain/game'
import { IDLE_RESCAN } from '@shared/domain/project'
import { noContext } from '@shared/domain/projectContext'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { DEFAULT_LANGUAGE } from '@shared/i18n/languages'
import type { LogEntry, StudioBridge, TraceEntry } from '@shared/ipc'
import { EMPTY_AI_OVERVIEW } from './fakeAiOverview'
import { fakeBridgeGit } from './fakeBridgeGit'
import { fakeBridgeMissions } from './fakeBridgeMissions'
import { fakeBridgeUpdates } from './fakeBridgeUpdates'
const fakeRetargetWindow = (overrides: BridgeOverrides): StudioBridge['retargetWindow'] => ({
  open: async () => {},
  focusOrigin: async () => {},
  ...overrides.retargetWindow,
})
const noSubscription = (): (() => void) => () => {}
const nothingMoved = (): Promise<FileOutcome> =>
  Promise.resolve({ done: [], refused: [], batch: 'batch-fake' })
export type BridgeOverrides = {
  [K in keyof StudioBridge]?: Partial<StudioBridge[K]>
}
const fakeSettings = (overrides: BridgeOverrides): StudioBridge['settings'] => ({
  read: () => Promise.resolve(DEFAULT_SETTINGS),
  write: () => Promise.resolve(DEFAULT_SETTINGS),
  authState: () => Promise.resolve({ authenticated: false, reason: 'missing' }),
  open: () => Promise.resolve(),
  runAction: () => Promise.resolve(),
  setPending: () => Promise.resolve(),
  onChange: noSubscription,
  onSection: noSubscription,
  ...overrides.settings,
})

const fakeMemory = (overrides: BridgeOverrides): StudioBridge['memory'] => ({
  list: () => Promise.resolve([]),
  recall: () => Promise.resolve([]),
  read: () => Promise.resolve(null),
  remember: () => Promise.resolve(null),
  amend: () => Promise.resolve(null),
  forget: () => Promise.resolve(false),
  rebuild: () => Promise.resolve(0),
  reset: () => Promise.resolve(),
  pending: () => Promise.resolve(0),
  index: () => Promise.resolve(),
  stopIndex: () => Promise.resolve(),
  compact: () => Promise.resolve(0),
  onChanged: noSubscription,
  onIndexed: noSubscription,
  ...overrides.memory,
})

const fakeMcp = (overrides: BridgeOverrides): StudioBridge['mcp'] => ({
  state: () => Promise.resolve({ port: null }),
  onState: noSubscription,
  ...overrides.mcp,
})

const fakeAccounts = (overrides: BridgeOverrides): StudioBridge['accounts'] => ({
  list: () => Promise.resolve([]),
  add: () => Promise.resolve({ accounts: [] }),
  rename: () => Promise.resolve({ accounts: [] }),
  remove: () => Promise.resolve({ accounts: [] }),
  activate: () => Promise.resolve({ accounts: [] }),
  credits: () => Promise.resolve({}),
  onChange: noSubscription,
  ...overrides.accounts,
})

const fakeProvider = (overrides: BridgeOverrides): StudioBridge['provider'] => ({
  searchModels: () => Promise.resolve({ items: [], cursor: null }),
  modelPreviews: () => Promise.resolve({}),
  describeModel: () => Promise.reject(new Error('no model')),
  plan: () => Promise.resolve(null),
  suggestPrompts: () => Promise.resolve([]),
  translatePrompt: draft => Promise.resolve({ text: draft, detectedLanguage: 'english' }),
  describeStyle: () => Promise.resolve({ description: '', synthesis: '' }),
  generate: () => Promise.reject(new Error('no generation')),
  estimateCost: () => Promise.resolve(null),
  uploadAsset: () => Promise.reject(new Error('no upload')),
  cancelJob: () => Promise.resolve(),
  listJobs: () => Promise.resolve([]),
  onProgress: noSubscription,
  onJobsChanged: noSubscription,
  usageReport: () => Promise.reject(new Error('no usage')),
  usageEvents: () => Promise.reject(new Error('no usage')),
  ...overrides.provider,
})

const fakeProject = (overrides: BridgeOverrides): StudioBridge['project'] => ({
  create: () => Promise.reject(new Error('no project')),
  open: () => Promise.reject(new Error('no project')),
  current: () => Promise.resolve(null),
  close: () => Promise.resolve(),
  askLeave: () => Promise.resolve(true),
  onChange: noSubscription,
  listFolder: () => Promise.resolve([]),
  searchFolder: () => Promise.resolve([]),
  walkFolder: () => Promise.resolve([]),
  openFile: () => Promise.resolve(true),
  onFolderChanged: noSubscription,
  onRescan: noSubscription,
  rescanState: () => Promise.resolve(IDLE_RESCAN),
  stopRescan: () => Promise.resolve(),
  folderRoles: () => Promise.resolve({}),
  folderFor: role => Promise.resolve(DEFAULT_ROLE_PATHS[role]),
  onFolderRoles: noSubscription,
  fileFacts: () => Promise.resolve(null),
  readContext: () => Promise.resolve(noContext()),
  writeContext: () => Promise.resolve(noContext()),
  onContextChanged: noSubscription,
  exportInto: () => Promise.resolve<string | null>(null),
  revealFile: () => Promise.resolve(),
  revealFolder: () => Promise.resolve(true),
  rename: () => Promise.reject(new Error('no project')),
  trash: () => Promise.reject(new Error('no project')),
  renameFile: nothingMoved,
  moveFiles: nothingMoved,
  trashFiles: nothingMoved,
  newFolder: nothingMoved,
  duplicateFiles: nothingMoved,
  pasteFiles: nothingMoved,
  undoFile: nothingMoved,
  redoFile: nothingMoved,
  fileHistory: () => Promise.resolve({ undo: false, redo: false }),
  onFilesChanged: noSubscription,
  ...overrides.project,
})

const fakeInputMaps = (overrides: BridgeOverrides): StudioBridge['inputMaps'] => ({
  list: () => Promise.resolve([]),
  read: () => Promise.resolve(null),
  write: () => Promise.resolve(false),
  ...overrides.inputMaps,
})

const fakeAnimationGraphs = (overrides: BridgeOverrides): StudioBridge['animationGraphs'] => ({
  list: () => Promise.resolve([]),
  read: () => Promise.resolve(null),
  write: () => Promise.resolve(false),
  ...overrides.animationGraphs,
})

const fakeDialog = (overrides: BridgeOverrides): StudioBridge['dialog'] => ({
  exportPicture: () => Promise.resolve(null),
  pickPath: () => Promise.resolve(null),
  ...overrides.dialog,
})

const fakeGame = (overrides: BridgeOverrides): StudioBridge['game'] => ({
  read: () => Promise.resolve(noGame()),
  write: () => Promise.reject(new Error('no game manifest stubbed')),
  scripts: () => Promise.resolve([]),
  writeScript: () => Promise.resolve(false),
  export: () => Promise.resolve(null),
  ...overrides.game,
})

const fakeDocuments = (overrides: BridgeOverrides): StudioBridge['documents'] => ({
  list: () => Promise.resolve([]),
  read: () => Promise.resolve(null),
  write: () => Promise.resolve<DocumentWrite>('written'),
  rename: () => Promise.reject(new Error('no rename stubbed')),
  remove: () => Promise.resolve(),
  opened: () => Promise.resolve(),
  confirmClose: () => Promise.resolve<CloseChoice>('cancel'),
  confirmFlatten: () => Promise.resolve(true),
  confirmDelete: () => Promise.resolve(false),
  confirmOverwrite: () => Promise.resolve(false),
  ...overrides.documents,
})

const fakeAssets = (overrides: BridgeOverrides): StudioBridge['assets'] => ({
  search: () => Promise.resolve([]),
  onChanged: noSubscription,
  counts: () => Promise.resolve(emptyAssetCounts()),
  peaks: () => Promise.resolve(null),
  reveal: () => Promise.resolve(false),
  absent: () => Promise.resolve([]),
  saveAudio: () => Promise.reject(new Error('no project')),
  savePicture: () => Promise.reject(new Error('no project')),
  savePlayerModule: () => Promise.reject(new Error('no project')),
  saveLayered: () => Promise.reject(new Error('no project')),
  saveMesh: () => Promise.reject(new Error('no project')),
  saveAnimation: () => Promise.reject(new Error('no project')),
  animationThumbnailModel: () => Promise.reject(new Error('no character')),
  saveAnimationThumbnail: () => Promise.reject(new Error('no project')),
  readLayered: () => Promise.resolve(null),
  saveTexture: () => Promise.reject(new Error('no project')),
  installBundledTextures: () => Promise.resolve([]),
  installBundledCharacter: () => Promise.resolve(null),
  extractTextures: () => Promise.reject(new Error('no project')),
  update: () => Promise.reject(new Error('no project')),
  remove: () => Promise.resolve(),
  describe: () => Promise.resolve(0),
  ...overrides.assets,
})

const fakeCloud = (overrides: BridgeOverrides): StudioBridge['cloud'] => ({
  browse: () => Promise.resolve({ assets: [], cursor: null }),
  explore: () => Promise.resolve({ assets: [], cursor: null }),
  similar: () => Promise.resolve([]),
  pull: () => Promise.resolve([]),
  push: () => Promise.resolve([]),
  plan: () => Promise.resolve({ actions: [], summary: { push: 0, pull: 0, conflict: 0, skip: 0 } }),
  ...overrides.cloud,
})

const fakeFavorites = (overrides: BridgeOverrides): StudioBridge['favorites'] => ({
  list: () => Promise.resolve([]),
  pin: () => Promise.resolve([]),
  unpin: () => Promise.resolve([]),
  ...overrides.favorites,
})

const fakeStyles = (overrides: BridgeOverrides): StudioBridge['styles'] => ({
  list: () => Promise.resolve([]),
  save: () => Promise.resolve([]),
  rename: () => Promise.resolve([]),
  remove: () => Promise.resolve([]),
  ...overrides.styles,
})

const fakeActivity = (overrides: BridgeOverrides): StudioBridge['activity'] => ({
  read: () => Promise.resolve([]),
  onEntries: () => () => {},
  ...overrides.activity,
})

const fakePost = (overrides: BridgeOverrides): StudioBridge['post'] => ({
  export: () => Promise.resolve(null),
  import: () => Promise.resolve(null),
  ...overrides.post,
})

const fakeScene = (overrides: BridgeOverrides): StudioBridge['scene'] => ({
  export: () => Promise.resolve(null),
  ...overrides.scene,
})

const fakeMontage = (overrides: BridgeOverrides): StudioBridge['montage'] => ({
  export: () => Promise.resolve(null),
  import: () => Promise.resolve(null),
  stems: () => Promise.resolve(null),
  ...overrides.montage,
})

const fakeRender = (overrides: BridgeOverrides): StudioBridge['render'] => ({
  start: () => Promise.resolve(null),
  frame: () => Promise.resolve(),
  finish: () => Promise.resolve(null),
  cancel: () => Promise.resolve(),
  ...overrides.render,
})

const fakeMaterial = (overrides: BridgeOverrides): StudioBridge['material'] => ({
  export: () => Promise.resolve(null),
  ...overrides.material,
})

const fakeSkybox = (overrides: BridgeOverrides): StudioBridge['skybox'] => ({
  export: () => Promise.resolve(null),
  ...overrides.skybox,
})

const fakeTasks = (overrides: BridgeOverrides): StudioBridge['tasks'] => ({
  onProgress: () => () => {},
  cancel: () => Promise.resolve(false),
  ...overrides.tasks,
})

const fakeFonts = (overrides: BridgeOverrides): StudioBridge['fonts'] => ({
  list: () => Promise.resolve([]),
  read: () => Promise.resolve(null),
  ...overrides.fonts,
})

const fakeAnimations = (overrides: BridgeOverrides): StudioBridge['animations'] => ({
  list: () => Promise.resolve([]),
  ...overrides.animations,
})

const fakeMedia = (overrides: BridgeOverrides): StudioBridge['media'] => ({
  ingest: () => Promise.resolve([]),
  ingestPaths: () =>
    Promise.resolve({ assets: [], documents: [], montages: [], refused: [], failed: [] }),
  importPicked: () =>
    Promise.resolve({ assets: [], documents: [], montages: [], refused: [], failed: [] }),
  adopt: () => Promise.resolve(null),
  cancel: () => Promise.resolve(),
  capabilities: () => Promise.resolve({ ffmpeg: true }),
  onProgress: noSubscription,
  ...overrides.media,
})

const fakeAssistant = (overrides: BridgeOverrides): StudioBridge['assistant'] => ({
  think: () => Promise.resolve({ say: '', calls: [], cost: 0 }),
  stop: () => Promise.resolve(),
  onAction: noSubscription,
  onStream: noSubscription,
  onVisualCapture: noSubscription,
  actionResult: () => Promise.resolve(),
  visualCaptureResult: () => Promise.resolve(),
  note: () => Promise.resolve(),
  said: () => Promise.resolve(null),
  window: () => Promise.resolve(null),
  ...overrides.assistant,
})

const fakeAi = (overrides: BridgeOverrides): StudioBridge['ai'] => ({
  overview: () => Promise.resolve(EMPTY_AI_OVERVIEW),
  choose: () => Promise.resolve(EMPTY_AI_OVERVIEW),
  chooseMany: () => Promise.resolve(EMPTY_AI_OVERVIEW),
  install: () => Promise.resolve(EMPTY_AI_OVERVIEW),
  cancelInstall: () => Promise.resolve(EMPTY_AI_OVERVIEW),
  installOllama: () => Promise.resolve(EMPTY_AI_OVERVIEW),
  readEngine: () => Promise.resolve(EMPTY_AI_OVERVIEW),
  installEngine: () => Promise.resolve(EMPTY_AI_OVERVIEW),
  cancelInstallEngine: () => Promise.resolve(EMPTY_AI_OVERVIEW),
  cancelInstallOllama: () => Promise.resolve(EMPTY_AI_OVERVIEW),
  remove: () => Promise.resolve(EMPTY_AI_OVERVIEW),
  load: () => Promise.resolve(EMPTY_AI_OVERVIEW),
  cancelLoad: () => Promise.resolve(EMPTY_AI_OVERVIEW),
  unload: () => Promise.resolve(EMPTY_AI_OVERVIEW),
  addOwnModel: () => Promise.resolve(EMPTY_AI_OVERVIEW),
  onChanged: noSubscription,
  ...overrides.ai,
})

const fakeDictation = (overrides: BridgeOverrides): StudioBridge['dictation'] => ({
  state: () => Promise.resolve({ state: 'idle', download: null, failure: null }),
  start: () => Promise.resolve(),
  stop: () => Promise.resolve(),
  cancel: () => Promise.resolve(),
  push: () => Promise.resolve(),
  downloadModel: () => Promise.resolve(),
  cancelDownload: () => Promise.resolve(),
  openPrivacySettings: () => Promise.resolve(),
  onEvent: noSubscription,
  ...overrides.dictation,
})

const fakeMirror = (overrides: BridgeOverrides): StudioBridge['mirror'] => ({
  open: () => Promise.resolve(),
  ...overrides.mirror,
})

const fakePlayerModuleWindow = (
  overrides: BridgeOverrides,
): StudioBridge['playerModuleWindow'] => ({
  open: () => Promise.resolve(),
  ...overrides.playerModuleWindow,
})

const fakeExternalFiles = (overrides: BridgeOverrides): StudioBridge['externalFiles'] => ({
  take: () => Promise.resolve([]),
  offer: () => Promise.resolve({ request: null, refused: [] }),
  discard: () => Promise.resolve(),
  onOpen: noSubscription,
  ...overrides.externalFiles,
})

const fakeGameWindow = (overrides: BridgeOverrides): StudioBridge['gameWindow'] => ({
  open: () => Promise.resolve(),
  close: () => Promise.resolve(),
  onClosed: () => () => {},
  ...overrides.gameWindow,
})

const fakeHelp = (overrides: BridgeOverrides): StudioBridge['help'] => ({
  open: () => Promise.resolve(),
  ...overrides.help,
})

const fakeFileInfo = (overrides: BridgeOverrides): StudioBridge['fileInfo'] => ({
  open: () => Promise.resolve(),
  ...overrides.fileInfo,
})

const fakeNewDocument = (overrides: BridgeOverrides): StudioBridge['newDocument'] => ({
  ask: () => Promise.resolve(null),
  request: () => Promise.resolve(null),
  answer: () => Promise.resolve(),
  ...overrides.newDocument,
})

const fakeWindow = (overrides: BridgeOverrides): StudioBridge['window'] => ({
  toggleFullScreen: () => Promise.resolve(),
  state: () => Promise.resolve({ active: true, fullScreen: false, maximized: false }),
  onState: noSubscription,
  language: () => Promise.resolve(DEFAULT_LANGUAGE),
  onLanguage: noSubscription,
  resumeLeave: () => Promise.resolve(),
  setWorkspace: () => Promise.resolve(),
  ...overrides.window,
})

const fakeDiagnostics = (overrides: BridgeOverrides): StudioBridge['diagnostics'] => ({
  onLog: noSubscription,
  report: () => Promise.resolve(),
  trace: () => Promise.resolve(),
  ...overrides.diagnostics,
})

const fakeMenu = (overrides: BridgeOverrides): StudioBridge['menu'] => ({
  popup: () => Promise.resolve(null),
  onOpenTool: noSubscription,
  onCommand: noSubscription,
  onDocumentNew: noSubscription,
  onOpenRecent: noSubscription,
  onSceneAdd: noSubscription,
  onSceneDisplay: noSubscription,
  onSceneExport: noSubscription,
  onSceneCapture: noSubscription,
  onMaterialExport: noSubscription,
  onSkyboxExport: noSubscription,
  ...overrides.menu,
})

const fakeNews = (overrides: BridgeOverrides): StudioBridge['news'] => ({
  read: topic => Promise.resolve({ topic, items: [], readAt: '2026-08-24T00:00:00.000Z' }),
  ...overrides.news,
})

function fakeBridge(overrides: BridgeOverrides): StudioBridge {
  return {
    settings: fakeSettings(overrides),
    memory: fakeMemory(overrides),
    mcp: fakeMcp(overrides),
    accounts: fakeAccounts(overrides),
    provider: fakeProvider(overrides),
    project: fakeProject(overrides),
    inputMaps: fakeInputMaps(overrides),
    animationGraphs: fakeAnimationGraphs(overrides),
    git: fakeBridgeGit(overrides.git),
    dialog: fakeDialog(overrides),
    game: fakeGame(overrides),
    documents: fakeDocuments(overrides),
    assets: fakeAssets(overrides),
    cloud: fakeCloud(overrides),
    favorites: fakeFavorites(overrides),
    styles: fakeStyles(overrides),
    activity: fakeActivity(overrides),
    post: fakePost(overrides),
    scene: fakeScene(overrides),
    montage: fakeMontage(overrides),
    render: fakeRender(overrides),
    material: fakeMaterial(overrides),
    skybox: fakeSkybox(overrides),
    tasks: fakeTasks(overrides),
    fonts: fakeFonts(overrides),
    animations: fakeAnimations(overrides),
    media: fakeMedia(overrides),
    assistant: fakeAssistant(overrides),
    missions: fakeBridgeMissions(overrides.missions),
    ai: fakeAi(overrides),
    autoRig: { run: () => Promise.reject(new Error('no Auto Rig backend')), ...overrides.autoRig },
    dictation: fakeDictation(overrides),
    mirror: fakeMirror(overrides),
    retargetWindow: fakeRetargetWindow(overrides),
    playerModuleWindow: fakePlayerModuleWindow(overrides),
    gameWindow: fakeGameWindow(overrides),
    help: fakeHelp(overrides),
    fileInfo: fakeFileInfo(overrides),
    newDocument: fakeNewDocument(overrides),
    window: fakeWindow(overrides),
    diagnostics: fakeDiagnostics(overrides),
    menu: fakeMenu(overrides),
    externalFiles: fakeExternalFiles(overrides),
    news: fakeNews(overrides),
    updates: fakeBridgeUpdates(overrides.updates),
  }
}

export function installFakeBridge(overrides: BridgeOverrides = {}): StudioBridge {
  const bridge = fakeBridge(overrides)
  vi.stubGlobal('studio', bridge)
  return bridge
}
export function bridgeWatchingLogs(overrides: BridgeOverrides = {}) {
  const report = vi.fn((_entry: LogEntry) => Promise.resolve())
  const trace = vi.fn((_entry: TraceEntry) => Promise.resolve())
  installFakeBridge({ ...overrides, diagnostics: { report, trace, ...overrides.diagnostics } })
  return { report, trace, entries: () => report.mock.calls.map(([entry]) => entry) }
}
