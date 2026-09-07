import {
  isDocumentExtension,
  kindForExtension,
  workspaceForKind,
  type DocumentDescriptor,
} from '@shared/domain/document'
import { extensionOf, stemOf } from '@shared/domain/fileName'
import { DEFAULT_LANGUAGE } from '@shared/i18n'
import { initI18n } from '@/i18n'
import { FOLDER_ROOT, nameOf, type FileKind } from '@shared/domain/folder'
import { registerConfirmer } from '@/features/assistant/confirm'
import { armCommandScope, subscribeToCommands, type CommandAnswer } from '@/services/commandBus'
import { emptyGame } from '@shared/domain/game'
import { followTheCanvas, type PaintedCells } from './canvasSurface'
import { followDocuments } from './followDocuments'
import { standInForWorkers } from './codeWorker'
import { drawing, PNG_HEAD } from '@/game/game-fixtures'
import { forgetSceneEngine, registerSceneEngine } from '@/stores/sceneEngines'
import { createGameStage } from '@/game/gameStage'
import { lendPictureMeasure } from '@/features/image/pictureSize'
import { resetDocumentStoresForTests } from '@/stores/documentStore'
import { useGenerationComments } from '@/stores/generationComments'
import { useAssistant } from '@/stores/assistant'
import { useJobs } from '@/stores/jobs'
import { useModels } from '@/stores/models'
import { noContext } from '@shared/domain/projectContext'
import { useProjectContext } from '@/stores/projectContext'
import { useTasks } from '@/stores/tasks'
import {
  activeCharacterAssetId,
  documentById,
  frontDocumentIn,
  useDocuments,
} from '@/stores/documents'
import { workshopIdOf } from '@shared/domain/character'
import { runWorkshopCommand } from '@/features/character/components/CharacterDocument/workshopCommands'
import {
  commandDescriptor,
  scopeOfWorkspace,
  type CommandId,
  type CommandScope,
  viewsScene,
} from '@shared/domain/command'
import { runAudioCommand } from '@/features/audio/components/audioCommands'
import { runCanvasCommand } from '@/features/image/components/ImageDocument/canvasCommands'
import { runExplorerCommand } from '@/features/explorer/components/Explorer/explorerCommands'
import { runSequenceCommand } from '@/features/video/components/TimelineCanvas/sequenceCommands'
import i18next from 'i18next'
import { runGuiDocumentCommand } from '@/features/gui/components/Gui/Document/guiDocumentCommands'
import { runMaterialCommand } from '@/features/material/components/Material/materialCommands'
import { runSkyboxCommand } from '@/features/skybox/components/Skybox/Document/skyboxCommands'
import { lendSkyboxExportPort } from '@/features/skybox/components/Skybox/Document/skyboxExportFiles'
import { lendMaterialExportPort } from '@/features/material/materialExportFiles'
import { toolSurface, useLayouts } from '@/stores/layouts'
import { declarePanelsOf } from '@/features/shell/panelSpecs'
import { subscribeToToolState } from '@/hooks/useToolState'
import { useProject } from '@/stores/project'
import { useSettings } from '@/stores/settings'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { runSceneCommand } from '@/features/scene/components/sceneCommands'
import { installGeneratorPanel } from './generatorPanel'
import { createBenchMemory } from './memoryStore'
import { createMemoryCatalog } from './memoryCatalog'
import { DOCUMENT_SOURCES, WHEN } from './project'
import { createMemoryCloud } from './memoryCloud'
import { createMemoryFiles } from './memoryFiles'
import { createMemoryGit } from './memoryGit'
import { createMemoryShell, type MemoryShell } from './memoryShell'
import { createMemoryFolder, type MemoryFolder } from './memoryFolder'
import { withRecentProject } from '@shared/domain/project'
import { installStudioBridge, type StudioBridgeContext } from './studioBridge'
import type { Studio, Think } from './studioContract'
import { studioFacade, type StudioRuntime } from './studioFacade'

export type { Studio, Think } from './studioContract'

type ScopeRunner = (command: CommandId, to: string | null) => CommandAnswer

/** A runner of a DOCUMENT scope: the command lands on the document it names, or the one in front. */
const onDocument =
  (
    scope: CommandScope,
    run: (documentId: string, command: CommandId) => CommandAnswer,
  ): ScopeRunner =>
  (command, to) => {
    const documentId = addressedBy(scope, to)
    return documentId !== null && run(documentId, command)
  }

/**
 * 🛑 TOTAL, so a scope added to `CommandScope` does not compile until it says who answers it —
 * a `Map` left the bench refusing `wrongSurface` in silence, the very hole this table fills.
 */
type ScopeRunners = Record<CommandScope, ScopeRunner | null>

/**
 * The project folder belongs to no document, and the window holds one panel of it at all times:
 * landing at the root, and settling as the panel's own runner does.
 */
const EXPLORER: ScopeRunner = command =>
  runExplorerCommand(command, {
    into: FOLDER_ROOT,
    folderName: i18next.t('explorer.newFolderName'),
  })

/** The model tab listens on the scene scope too, for what moves its VIEW — the tab's own door. */
const onWorkshop: ScopeRunner = (command, to) => {
  const assetId = activeCharacterAssetId(useDocuments.getState())
  if (assetId === null || to !== null) return false
  return runWorkshopCommand(command, { workshopId: workshopIdOf(assetId) })
}

/** The scopes a headless run can answer, each by the function its own tab calls. */
const SCOPE_RUNNERS: ScopeRunners = {
  scene: (command, to) => {
    const documentId = addressedBy('scene', to)
    return documentId !== null ? runSceneCommand(documentId, command) : onWorkshop(command, to)
  },
  gui: onDocument('gui', runGuiDocumentCommand),
  skybox: onDocument('skybox', runSkyboxCommand),
  material: onDocument('material', runMaterialCommand),
  audio: onDocument('audio', runAudioCommand),
  canvas: onDocument('canvas', runCanvasCommand),
  sequence: onDocument('sequence', runSequenceCommand),
  explorer: EXPLORER,
  // The application's own, which `routeCommand` runs before any surface is asked.
  global: null,
  spaces: null,
  // 🛑 A WINDOW of its own, keyed by an asset rather than by a document: no workspace and no kind
  // answers `character`, so `addressedBy` can never resolve one. A headless run has no such
  // window, and its undo stack is the only thing the scope carries.
  character: null,
}

/** The document the studio shows — what a command with no address lands on. */
function frontDocument(): DocumentDescriptor | null {
  const { activeId, documents } = useDocuments.getState()
  return activeId === null ? null : (documents[activeId] ?? null)
}

/**
 * 🛑 The scope a document edits through, read off `scopeOfWorkspace` rather than off a table of
 * this bench's own: an interface opens in the 3D space and answers `gui`, so a runner picked by
 * workspace would have sent ⌘Z on an interface to the scene's history.
 */
const scopeOf = (document: DocumentDescriptor | null): CommandScope | null =>
  document === null ? null : scopeOfWorkspace(document.workspace, document.kind)

/** Where a command of this scope lands: the document it NAMES, or the one in front. */
function addressedBy(scope: CommandScope, to: string | null): string | null {
  const document = to === null ? frontDocument() : documentById(useDocuments.getState(), to)
  return scopeOf(document) === scope ? (document?.id ?? null) : null
}

/** What the GPU exports answer here: one picture named after the document — see `PNG_HEAD`. */
const stillNamed = ({ name }: { name: string }) =>
  Promise.resolve([{ name, extension: '.png', bytes: PNG_HEAD }])

/** What `documents.list` answers: every file of the project the studio opens as a document. */
function descriptorsOf(folder: MemoryFolder): DocumentDescriptor[] {
  return folder
    .paths()
    .filter(path => isDocumentExtension(extensionOf(path)))
    .flatMap(path => {
      const kind = kindForExtension(extensionOf(path))
      const workspace = kind ? workspaceForKind(kind) : null
      if (!kind || !workspace) return []

      return [{ id: `doc-${path}`, kind, workspace, title: stemOf(nameOf(path)), path }]
    })
}

/** jsdom decodes nothing — `file.open` on a photo hung for the whole timeout. Not 1024²: a
 * document that took its picture's size has to be tellable from one that fell back. */
const PICTURE = { width: 1024, height: 768 }

/** What the stand-in TYPES where a question offers nothing to press — a name, most often. */
const TYPED_ANSWER = 'Banc'

/**
 * 🛑 The studio's own translations, which a headless run had none of: `i18next.t` answered
 * `undefined`, and `landingChoice` handed that to `safeFileName` — nine of ninety-five scenarios
 * died in `generator.submit` on « reading 'normalize' », measured 2026-09-01.
 */
const speakFrench = (): Promise<void> => initI18n(DEFAULT_LANGUAGE)

async function prepareContext(
  seed: readonly { path: string; kind: FileKind }[],
): Promise<StudioBridgeContext> {
  const folder = createMemoryFolder(seed)
  await Promise.all(DOCUMENT_SOURCES.map(one => folder.write(one.path, one.source)))
  const catalog = createMemoryCatalog(seed)
  return {
    folder,
    catalog,
    ops: createMemoryFiles(folder, catalog),
    cloud: createMemoryCloud(folder, catalog),
    documentsOnDisk: new Map(descriptorsOf(folder).map(one => [one.id, one])),
    git: createMemoryGit(),
    shell: createMemoryShell(assetId => catalog.rows().find(one => one.id === assetId) ?? null),
    memory: createBenchMemory(),
    game: { current: emptyGame() },
  }
}

async function resetBench(shell: MemoryShell): Promise<void> {
  useProject.setState({ project: shell.projectAt('/projets/Démo'), known: true })
  resetDocumentStoresForTests()
  useDocuments.setState({ documents: {}, stored: [], activeId: null })
  useGenerationComments.setState({ comments: {} })
  useJobs.setState({ jobs: [], bodies: {} })
  useModels.setState({ selected: {}, preset: {} })
  useTasks.setState({ running: {} })
  useProjectContext.setState({ context: noContext(), loaded: true })
  useSettings.setState({ settings: DEFAULT_SETTINGS })
  const open = useProject.getState().project
  if (open) {
    useSettings.setState(state => ({
      settings: {
        ...state.settings,
        storage: {
          ...state.settings.storage,
          lastProject: open.path,
          recentProjects: withRecentProject(state.settings.storage.recentProjects, open, WHEN),
        },
      },
    }))
  }
  await useDocuments.getState().relist()
}

function connectAssistant(
  cloud: StudioBridgeContext['cloud'],
  answers: 'yes' | 'no',
): { references: string[]; cleanups: (() => void)[] } {
  const references: string[] = []
  const giveBackMeasure = lendPictureMeasure(() => Promise.resolve(PICTURE))
  const giveBackSky = lendSkyboxExportPort(stillNamed)
  const giveBackMaterial = lendMaterialExportPort(stillNamed)
  const closeGenerator = installGeneratorPanel(cloud.fieldsOf, given => references.push(...given))
  const closeConfirmer = registerConfirmer(request =>
    Promise.resolve({ granted: answers === 'yes', input: request.input }),
  )
  const closeChooser = useAssistant.subscribe((state, before) => {
    if (state.choosing && state.choosing !== before.choosing) {
      state.choose(
        state.choosing.questions.map(one => ({ answer: one.choices[0] ?? TYPED_ANSWER })),
      )
    }
  })
  return {
    references,
    cleanups: [
      closeConfirmer,
      closeChooser,
      closeGenerator,
      giveBackMeasure,
      giveBackSky,
      giveBackMaterial,
    ],
  }
}

function followDock(): () => void {
  const activated = new Set<string>()
  let space = useLayouts.getState().activeWorkspace
  const onDocument = useDocuments.subscribe(state => {
    const fresh = Object.keys(state.documents).find(one => !activated.has(one))
    if (fresh === undefined) return
    activated.add(fresh)
    if (state.activeId !== fresh) useDocuments.getState().activate(fresh)
  })
  const onSpace = useLayouts.subscribe(state => {
    if (state.activeWorkspace === space) return
    space = state.activeWorkspace
    const wanted = frontDocumentIn(useDocuments.getState(), space)
    if (wanted !== null) useDocuments.getState().activate(wanted)
  })
  const onOffer = subscribeToToolState(() => declarePanelsOf(toolSurface()))
  declarePanelsOf(toolSurface())
  return () => {
    onDocument()
    onSpace()
    onOffer()
  }
}

/** A model tab arms the scene scope, as the real tab does — see `onWorkshop`. */
function armedScopeOf(scope: CommandScope | null): CommandScope | null {
  if (scope !== null && viewsScene(scope)) return 'scene'
  return scope !== null && SCOPE_RUNNERS[scope] !== null ? scope : null
}

function followCommandBus(): () => void {
  let armedScope: CommandScope | null = null
  let disarm: (() => void) | null = null
  const followTheFront = (): void => {
    const scope = scopeOf(frontDocument())
    const answered = armedScopeOf(scope)
    if (answered === armedScope) return
    disarm?.()
    armedScope = answered
    disarm = answered === null ? null : armCommandScope(answered)
  }
  const disarmExplorer = armCommandScope('explorer')
  const stop = subscribeToCommands((command, to) => {
    const scope = commandDescriptor(command)?.scope
    return (scope !== undefined && SCOPE_RUNNERS[scope]?.(command, to)) ?? false
  })
  const unfollow = useDocuments.subscribe(followTheFront)
  followTheFront()
  return () => {
    stop()
    unfollow()
    disarm?.()
    disarmExplorer()
  }
}

function followViewport(): () => void {
  return followDocuments(
    () => true,
    documentId => {
      registerSceneEngine(documentId, drawing())
      return () => forgetSceneEngine(documentId)
    },
  )
}

/**
 * 🛑 Closing the last document closes the studio WINDOW (`documentIo.ts`), and jsdom's `close()`
 * tears its document down: every scenario after 5.4 died on `localStorage` (2026-09-06). A run
 * without a screen has no window to close.
 */
function standInForTheWindow(): () => void {
  const held = window.close
  window.close = () => {}
  return () => {
    window.close = held
  }
}

function connectSurfaces(): { painted: PaintedCells; cleanups: (() => void)[] } {
  const painted: PaintedCells = new Map()
  const stage = createGameStage({ renderer: drawing(), input: new EventTarget() })
  return {
    painted,
    cleanups: [
      followDock(),
      followCommandBus(),
      followTheCanvas(painted),
      followViewport(),
      () => stage.close(),
      standInForWorkers(),
      standInForTheWindow(),
    ],
  }
}

export async function createStudio(
  seed: readonly { path: string; kind: FileKind }[],
  think?: Think,
  answers: 'yes' | 'no' = 'yes',
): Promise<Studio> {
  await speakFrench()
  const context = await prepareContext(seed)
  installStudioBridge(context, think)
  await resetBench(context.shell)
  const assistant = connectAssistant(context.cloud, answers)
  const surfaces = connectSurfaces()
  const runtime: StudioRuntime = {
    references: assistant.references,
    refusals: [],
    poses: new Map(),
    settled: new Set(),
    painted: surfaces.painted,
  }
  return studioFacade(context, runtime, [...assistant.cleanups, ...surfaces.cleanups])
}
