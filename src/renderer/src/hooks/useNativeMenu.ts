import { useEffect } from 'react'
import { scopeOfWorkspace, type MenuAbility, type MenuCheck } from '@shared/domain/command'
import { revealTool } from '@/helpers/revealPanel'
import { availableToolIds } from '@/helpers/toolRegistry'
import { getBridge } from '@/services/bridge'
import { routeCommand } from '@/services/commandRouter'
import { addNodeTo } from '@/hooks/useAddNode'
import { createDocumentOfKind } from '@/features/shell/newDocument'
import { openRecent } from '@/features/shell/openRecent'
import { canMaskFromSelection, canMergeDown } from '@/engines/canvas/canvasState'
import { canvasOf, useCanvases } from '@/stores/canvases'
import { selectionOf, useCanvasViews } from '@/stores/canvasViews'
import { activeIdOfKind, activeSceneOrWorkshopId, useDocuments } from '@/stores/documents'
import { closableTabId } from '@/features/shell/components/dockviewApi'
import { displayOfPane } from '@/stores/sceneViewChrome'
import { MAIN_SCENE_PANE, sceneViewOf, useSceneViews } from '@/stores/sceneViews'
import { sceneOf, useScenes } from '@/stores/scenes'
import { useGit } from '@/stores/git'
import { toolSurface, useLayouts } from '@/stores/layouts'
import { useModels } from '@/stores/models'
import { useProject } from '@/stores/project'
import { useSettings } from '@/stores/settings'
import { takeExternalFiles } from '@/services/externalFiles'

type SceneMenuState = { checked: MenuCheck[]; abilities: MenuAbility[] }

/**
 * What the scene in front tells the menu: which View rows are ticked, and which rows can answer
 * at all. Both in one read, the id being resolved once — this is priced on every write of two
 * stores, one of which a timeline drag writes on every frame of the pointer.
 *
 * Only the main pane's way of drawing is published: a quad layout gives each of its four views
 * one, and a menu has a single row to say it with — the bar has the same limit, see `SceneDocument`.
 */
function sceneMenuState(): SceneMenuState {
  // The model tab's workshop too: its View rows tick off the same view store.
  const documentId = activeSceneOrWorkshopId(useDocuments.getState())
  if (!documentId) return { checked: [], abilities: [] }

  const view = sceneViewOf(useSceneViews.getState(), documentId)
  const checked: MenuCheck[] = [`scene.display:${displayOfPane(view.displays, MAIN_SCENE_PANE)}`]

  if (view.projection === 'orthographic') checked.push('scene.projection')
  if (view.quad) checked.push('scene.quad')
  if (view.quadEdges) checked.push('scene.quadEdges')
  if (view.skeletons) checked.push('scene.skeletons')
  if (view.poseMode) checked.push('scene.poseMode')

  // The scene is where its own selection lives, and the only place it ever did: the global
  // selection carried a copy that nothing read and that any other panel could wipe.
  const picked = sceneOf(useScenes.getState(), documentId).selectedIds.length > 0

  return { checked, abilities: picked ? ['scene.exportSelection'] : [] }
}

/**
 * The image document's half: the two Image rows that refuse in silence when the stack cannot
 * answer them.
 *
 * Through the two exported predicates rather than by re-deriving them, exactly as
 * `canRemoveLayer` is read from both sides: the handler that RUNS the gesture reads the same
 * answer, so a row can never be offered for something the handler will decline. Spelt again here,
 * the mask row was enabled with a selection and no active layer — and clicking it did nothing.
 */
function canvasAbilities(): MenuAbility[] {
  const documentId = activeIdOfKind(useDocuments.getState(), 'image')
  if (!documentId) return []

  const stack = canvasOf(useCanvases.getState(), documentId)
  const selected = selectionOf(useCanvasViews.getState(), documentId) !== null
  const abilities: MenuAbility[] = []

  if (canMaskFromSelection(stack, selected)) abilities.push('canvas.maskFromSelection')
  if (canMergeDown(stack)) abilities.push('canvas.mergeDown')

  return abilities
}

/**
 * What was last sent, so an identical context is not sent twice.
 *
 * The main process already drops a rebuild that changes nothing, and that was enough while this
 * was published on three stores nobody writes in a loop. `useSceneViews` and `useScenes` are not
 * among those: compared here, a played animation sends nothing; compared only on the other side,
 * it would send sixty messages a second for a menu that never changes.
 */
let published = ''

/** The scene's half of it, so the writes that change no row are dismissed without pricing the rest. */
let publishedScene = ''

/** The git half, for the same reason: `busy` flips twice a command and moves no row. */
let publishedGitKind = ''

/**
 * The image half, and it belongs to that same family: dragging a layer rewrites `useCanvases`
 * on every pointer move, and none of those frames moves a row.
 */
let publishedCanvas = ''

function sceneSignature(state: SceneMenuState): string {
  return `${state.checked.join('|')}/${state.abilities.join('|')}`
}

/**
 * Tells the main process what the menu should offer. Published from here rather than from
 * `setActiveWorkspace`, because it depends on more than the section: choosing a model brings
 * the generator into existence, and the menu has to learn it at that moment.
 */
function publishMenuContext(): void {
  // The surface in front, not the space behind it: the home carries the Explorer alone, and a
  // menu built on the space it covers offered the whole image toolbox over a screen that edits
  // no image — along with every other row only a document can answer.
  const surface = toolSurface()
  const tools = availableToolIds(surface)
  const scene = sceneMenuState()
  const canvas = canvasAbilities()
  const front = useDocuments.getState()
  // Both refused in silence over a screen with no document — `routeCommand` answers `noSurface`
  // and nothing on the menu said so, which is what an enabled row promises it will not do.
  const saving: MenuAbility[] = front.activeId ? ['document.save', 'document.saveAs'] : []
  // The router's own answer, said on the row before it is pressed rather than worked out again.
  const closing: MenuAbility[] = closableTabId() ? ['document.close'] : []
  const abilities = [...saving, ...closing, ...scene.abilities, ...canvas]
  // The scope and not the kind, since the menu asks whose history ⌘Z pops: the 3D space opens
  // both scenes and interfaces, and the two do not answer the same.
  const scope = scopeOfWorkspace(
    surface,
    (front.activeId ? front.documents[front.activeId] : undefined)?.kind,
  )

  const signature = JSON.stringify([surface, tools, scene.checked, abilities, scope])
  if (signature === published) return
  published = signature
  publishedScene = sceneSignature(scene)
  publishedCanvas = canvas.join('|')

  void getBridge()?.window.setWorkspace(surface, tools, scene.checked, abilities, scope)
}

/** The listener of the two image stores — a layer drag writes one on every pointer move. */
function publishIfCanvasChanged(): void {
  if (canvasAbilities().join('|') === publishedCanvas) return
  publishMenuContext()
}

/**
 * The listener of the two scene stores, and the reason it is not `publishMenuContext` itself.
 *
 * Both are written far more often than the menu changes — the playhead on every frame of a
 * running animation, the scene on every pointer move of a timeline drag — while the full context
 * is not free to build: `availableToolIds` walks the whole tool registry. `sceneMenuState` is,
 * so the writes that move no row are dismissed before that work happens.
 */
function publishIfSceneChanged(): void {
  if (sceneSignature(sceneMenuState()) === publishedScene) return
  publishMenuContext()
}

/**
 * The same guard for git: only which state the repository is IN can add or remove a row.
 *
 * The kind is recorded HERE rather than in `publishMenuContext`, which returns early when the
 * context has not moved: two kinds that offer the same panels would leave it on the first of
 * them, and every `busy` flip after that would pay a full registry walk to find that out.
 */
function publishIfGitChanged(): void {
  const { kind } = useGit.getState().repository
  if (kind === publishedGitKind) return
  publishedGitKind = kind
  publishMenuContext()
}

function subscribeMenuPublishers(): Array<() => void> {
  const stops = [useLayouts, useSettings, useDocuments, useProject].map(store =>
    store.subscribe(publishMenuContext),
  )
  stops.push(
    useModels.subscribe((state, previous) => {
      if (state.selected !== previous.selected) publishMenuContext()
    }),
  )
  for (const store of [useSceneViews, useScenes]) stops.push(store.subscribe(publishIfSceneChanged))
  for (const store of [useCanvases, useCanvasViews])
    stops.push(store.subscribe(publishIfCanvasChanged))
  stops.push(useGit.subscribe(publishIfGitChanged))
  return stops
}

/**
 * Wires the native menu to the shell. Without this listener, "View ▸ Tool windows" would emit
 * into the void and the menu entries would silently do nothing.
 */
export function useNativeMenu(): void {
  // Subscribed once for the lifetime of the app: every listener below reads its store at call
  // time, so nothing here has to be torn down when a tab or a document changes.
  useEffect(() => {
    const bridge = getBridge()
    if (!bridge) return

    // A window that has just mounted has announced nothing, whatever a previous mount of this
    // module sent. Without this the first publication after a remount would be skipped as a
    // duplicate, and the menu would sit on what the PREVIOUS window happened to leave behind.
    published = ''
    publishedScene = ''
    publishedGitKind = ''
    publishedCanvas = ''
    // The persisted workspace is restored without going through `setActiveWorkspace`, so the
    // menu would sit on the default until the user switched spaces by hand.
    publishMenuContext()
    // The main process drops a rebuild that changes nothing, so publishing on every write of
    // these stores costs a comparison rather than a menu. `useDocuments` is among them because
    // which scene is in front decides what the ticks read.
    // `useProject` is among them because the home offers the Explorer only while a project is
    // open: without it the row would stay in the menu until something else happened to publish.
    const stopPublishing = subscribeMenuPublishers()

    // Through `revealTool`, which resolves the zone: a tool sits in different ones depending on
    // the workspace, and the menu is built once for the whole app.
    const stopTool = bridge.menu.onOpenTool(({ tool }) => revealTool(tool))

    // The verdict is dropped on purpose: a menu row that reaches nothing is a row already greyed
    // out, and there is nobody to answer. An MCP client is the caller that needs it.
    const stopCommand = bridge.menu.onCommand(command => void routeCommand(command))
    // One row of File ▸ New. The same door the plus button opens, with the kind already named:
    // the name and the folder are still asked, so a template is still offered where there is one.
    const stopDocumentNew = bridge.menu.onDocumentNew(({ kind }) => void createDocumentOfKind(kind))

    const stopOpenRecent = bridge.menu.onOpenRecent(request => void openRecent(request))
    const stopExternalFiles = bridge.externalFiles?.onOpen(() => void takeExternalFiles())
    if (bridge.externalFiles) void takeExternalFiles()

    // The same path the toolbar and the panels take: two ways of adding a node would drift.
    const stopSceneAdd = bridge.menu.onSceneAdd(({ kind }) => {
      // Of the right kind: the menu is app-wide, and a node written under an image document
      // would give it a scene and a history it has no editor for. A model tab's workshop takes
      // no node either — nothing saves one yet.
      const documentId = activeIdOfKind(useDocuments.getState(), 'scene')
      if (documentId) addNodeTo(documentId, kind)
    })

    const stopSceneDisplay = bridge.menu.onSceneDisplay(({ mode }) => {
      const documentId = activeSceneOrWorkshopId(useDocuments.getState())
      if (documentId) useSceneViews.getState().setDisplay(documentId, MAIN_SCENE_PANE, mode)
    })

    return () => {
      stopTool()
      stopCommand()
      stopDocumentNew()
      stopOpenRecent()
      stopExternalFiles?.()
      stopSceneAdd()
      stopSceneDisplay()
      for (const stop of stopPublishing) stop()
    }
  }, [])
}
