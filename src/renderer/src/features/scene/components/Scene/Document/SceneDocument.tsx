import type { AssetType } from '@shared/domain/asset'
import type { CommandId } from '@shared/domain/command'
import { isDisplayMode } from '@shared/domain/scene'
import { DEFAULT_CAPTURE_QUALITY } from '@shared/domain/sceneCapture'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { AssetDropTarget } from '@/components/AssetDropTarget'
import { PANE_TOOLBAR } from '@/components/styles'
import { Toolbar } from '@/components/Toolbar/Toolbar'
import { hideIn, NOTHING_ISOLATED, type Isolation } from '@/engines/scene/isolation'
import type { SceneNode } from '@/engines/scene/sceneState'
import type { TransformMode } from '@/engines/scene/SceneRenderer'
import { toggledIsolation } from '@/engines/scene/sceneVisibility'
import { captureSceneView } from '@/helpers/captureSceneView'
import { formatDecimal } from '@/helpers/format'
import { addNodeTo } from '@/hooks/useAddNode'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useRestoredDocument } from '@/hooks/useRestoredDocument'
import { useShortcuts } from '@/hooks/useShortcuts'
import { useDocumentIsInFront } from '@/stores/documents'
import { addModelTo, isSceneDirty, sceneOf, useScenes } from '@/stores/scenes'
import { sceneViewChromeOf } from '@/stores/sceneViewChrome'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'
import { useSettings } from '@/stores/settings'
import { CameraPreview } from '../../Camera/CameraPreview'
import { runSceneCommand } from '../../sceneCommands'
import { cycleSceneDisplay, toggleSceneSkeletons } from '../../sceneViewCommands'
import { SceneClock } from '../SceneClock'
import { SceneCounters } from '../SceneCounters'
import { SceneNavigationHint } from '../SceneNavigationHint'
import { ScenePaneGrid } from '../PaneGrid/ScenePaneGrid'
import { SceneSnapBar } from '../Snap/SceneSnapBar'
import { NAVIGATE_TOOL, SCENE_TOOLS, addedKind } from '../sceneTools'
import { SceneDocumentMarquee } from './SceneDocumentMarquee'
import { useSceneEngineSync } from './hooks/useSceneEngineSync'
import { useSceneRuntime } from './hooks/useSceneRuntime'
import { useSceneToolbarTools } from './hooks/useSceneToolbarTools'
import { openNodeMenu } from './sceneRuntimeActions'
import { SceneOptimizationDialog } from '../SceneOptimizationDialog'
import { SceneGameExportDialog } from '../SceneGameExportDialog'

/** What one of the three visibility gestures does, given the scene and what is already hidden. */
type IsolationEdit = (
  held: Isolation,
  nodes: readonly SceneNode[],
  ids: readonly string[],
) => Isolation

/** Read at call time so nothing closes over a scene — see the `useCallback` that dispatches. */
function changeIsolation(documentId: string, edit: IsolationEdit): void {
  const scene = sceneOf(useScenes.getState(), documentId)
  const held = sceneViewOf(useSceneViews.getState(), documentId).isolation

  useSceneViews.getState().setSceneIsolation(documentId, edit(held, scene.nodes, scene.selectedIds))
}

const MESHES: readonly AssetType[] = ['mesh']
const UNHANDLED = Symbol('unhandled scene document command')

type DocumentCommandContext = {
  documentId: string
  armTool: (mode: TransformMode) => void
  active: boolean
  setNavigating: Dispatch<SetStateAction<boolean>>
  cycleDisplay: () => void
  canAdd: () => boolean
  view: ReturnType<typeof sceneViewChromeOf>
}

function runToolCommand(command: CommandId, context: DocumentCommandContext) {
  const { documentId, armTool, view } = context
  switch (command) {
    case 'scene.select':
      return armTool('select')
    case 'scene.translate':
      return armTool('translate')
    case 'scene.rotate':
      return armTool('rotate')
    case 'scene.scale':
      return armTool('scale')
    case 'scene.snap':
      return useSceneViews.getState().toggleSceneSnapping(documentId)
    case 'scene.isolate':
      return changeIsolation(documentId, toggledIsolation)
    case 'scene.hide':
      return changeIsolation(documentId, (held, _nodes, ids) => hideIn(held, ids))
    case 'scene.showAll':
      return changeIsolation(documentId, () => NOTHING_ISOLATED)
    case 'scene.space':
      return useSceneViews.getState().setLocalFrame(documentId, !view.localFrame)
    default:
      return UNHANDLED
  }
}

function runViewportCommand(command: CommandId, context: DocumentCommandContext) {
  const { documentId } = context
  switch (command) {
    case 'scene.navigate':
      if (!context.active) return false
      return context.setNavigating(current => !current)
    case 'scene.display':
      return context.cycleDisplay()
    case 'scene.capture':
      return void captureSceneView(documentId, DEFAULT_CAPTURE_QUALITY)
    case 'scene.add':
      return context.canAdd() ? openNodeMenu(documentId, null) : undefined
    default:
      return runViewToggleCommand(command, context)
  }
}

function runViewToggleCommand(command: CommandId, context: DocumentCommandContext) {
  const { documentId, view } = context
  switch (command) {
    case 'scene.skeletons':
      return toggleSceneSkeletons(documentId)
    case 'scene.poseMode':
      return useSceneViews.getState().setPoseMode(documentId, !view.poseMode)
    case 'scene.quad':
      return useSceneViews.getState().setQuad(documentId, !view.quad)
    case 'scene.quadEdges':
      return useSceneViews.getState().setQuadEdges(documentId, !view.quadEdges)
    case 'scene.projection':
      return useSceneViews
        .getState()
        .setProjection(
          documentId,
          view.projection === 'perspective' ? 'orthographic' : 'perspective',
        )
    default:
      return UNHANDLED
  }
}

export function SceneDocument({ documentId }: { documentId: string }) {
  const { t, i18n } = useTranslation()
  const [mode, setMode] = useState<TransformMode>('select')
  const {
    host,
    engine,
    live,
    navigating,
    setNavigating,
    marquee,
    flySpeed,
    stats,
    paneInHand,
    canAdd,
  } = useSceneRuntime(documentId)

  const scene = useScenes(state => sceneOf(state, documentId))
  // Held rather than filtered in the rendering: the rectangle publishes a box a frame, and a walk
  // of every node per publication is work proportional to the scene on a gesture's hot path.
  const cameras = useMemo(() => scene.nodes.filter(node => node.type === 'camera'), [scene.nodes])
  const modified = useScenes(state => isSceneDirty(state, documentId))
  const active = useDocumentIsInFront(documentId)
  const viewport = useSettings(state => state.settings.three)
  const view = useSceneViews(useShallow(state => sceneViewChromeOf(state, documentId)))

  // Before the renderer mounts: a saved document comes back from the project, a new one from
  // the default scene — an unlit viewport reads as broken rather than as empty.
  useRestoredDocument(documentId)

  useDocumentTitle(documentId, modified)
  useSceneEngineSync({ engine, scene, viewport, view, mode, documentId, active })

  /**
   * Which view a display command lands on: the one the pointer is over, as every modelling
   * package reads it. The engine is asked rather than React tracking it — the pointer is the
   * viewport's own business, and a second tally here is a second answer free to disagree.
   */
  const cycleDisplay = useCallback(
    () => cycleSceneDisplay(documentId, paneInHand()),
    [documentId, paneInHand],
  )

  // Single dispatch: the toolbar and the keyboard both resolve to a `CommandId` first, so a new
  // tool is declared once in `SCENE_TOOLS` and handled once here.
  const armTool = useCallback(
    (tool: TransformMode) => {
      setNavigating(false)
      setMode(tool)
    },
    [setNavigating],
  )

  const run = useCallback(
    function runSceneDocumentCommand(command: CommandId) {
      // What acts on the selection is shared with the node menu, which arrives by the same ids —
      // see `runSceneCommand`. What is left below is what only this viewport can answer for.
      const shared = runSceneCommand(documentId, command)
      if (shared !== false) return shared

      const context = { documentId, armTool, active, setNavigating, cycleDisplay, canAdd, view }
      const toolResult = runToolCommand(command, context)
      if (toolResult !== UNHANDLED) return toolResult
      const viewportResult = runViewportCommand(command, context)
      if (viewportResult !== UNHANDLED) return viewportResult
    },
    [documentId, view, cycleDisplay, armTool, active, canAdd, setNavigating],
  )

  /** Two flyouts answer here: the ways of drawing, and the three families a scene grows by. */
  const runMode = useCallback(
    (toolId: string, modeId: string) => {
      const added = addedKind(toolId, modeId)
      if (added) return addNodeTo(documentId, added)

      if (isDisplayMode(modeId)) {
        useSceneViews.getState().setDisplay(documentId, paneInHand(), modeId)
      }
    },
    [documentId, paneInHand],
  )

  // Derived rather than stored: a background tab keeps its engine, and a captured pointer there
  // would fly a scene nobody is looking at. The engine owns the capture; this only says whether
  // the mode is meant to be on.
  const armed = navigating && active
  useEffect(() => {
    engine.current?.setNavigating(armed)
  }, [armed, live, engine])

  useShortcuts({
    scope: 'scene',
    // Dockview keeps hidden tabs mounted, and the hook swallows the keys it recognises: a
    // scene left in a background tab would eat the space bar the video space listens for.
    enabled: active,
    documentId,
    // Pushed on change, not polled: the engine restarts its own loop while something moves, so
    // nothing has to tick when the keyboard is idle.
    onMotionChange: held => engine.current?.setMotion(held),
    isFlying: () => engine.current?.flying ?? false,
    flightOwnsArrows: () => engine.current?.flightOwnsArrows ?? false,
    onCommand: run,
  })

  const tools = useSceneToolbarTools(scene, view)

  return (
    <AssetDropTarget
      accepts={MESHES}
      onDrop={asset => addModelTo(documentId, asset)}
      filesAreInternal
      // No frame: see `ImageDocument` — a surface that fills the centre outlines what the user is
      // already looking at.
      outlined={false}
      className="relative size-full"
    >
      {/*
        The renderer makes its own canvas in here — see `SceneRenderer.mount`.

        A tab stop is what lets a running game and keyboard-only navigation reach the viewport:
        key events fire
        at the focused element, a canvas cannot hold focus, and a click inside focuses the nearest
        focusable ancestor. The visible focus ring appears only for keyboard focus, not a click.
      */}
      <div
        ref={host}
        role="region"
        aria-label={t('sceneNavigation.viewport')}
        tabIndex={0}
        className="absolute inset-0"
      />
      <SceneDocumentMarquee box={marquee} />
      <SceneClock documentId={documentId} duration={scene.animation.duration} renderer={live} />
      <SceneCounters scene={stats.scene} selected={stats.selected} />
      <SceneSnapBar
        documentId={documentId}
        speed={flySpeed}
        onSpeed={speed => engine.current?.setFlySpeed(speed)}
      />
      {armed && <SceneNavigationHint speed={flySpeed} />}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {armed
          ? [
              t('sceneNavigation.active'),
              flySpeed === null
                ? null
                : t('sceneNavigation.speed', {
                    value: formatDecimal(flySpeed, i18n.language, { digits: 1 }),
                  }),
              t('sceneNavigation.leave'),
            ]
              .filter(Boolean)
              .join(' ')
          : t('sceneNavigation.inactive')}
      </span>
      <CameraPreview documentId={documentId} />
      {view.quad && (
        <ScenePaneGrid
          views={view.panes}
          cameras={cameras}
          onView={(pane, chosen) => useSceneViews.getState().setPaneView(documentId, pane, chosen)}
        />
      )}
      <Toolbar
        className={PANE_TOOLBAR}
        tools={tools}
        activeTool={armed ? NAVIGATE_TOOL : mode}
        onTool={id => {
          const command = SCENE_TOOLS.find(candidate => candidate.id === id)?.command
          if (command) run(command)
        }}
        onMode={runMode}
      />
      <SceneOptimizationDialog documentId={documentId} />
      <SceneGameExportDialog documentId={documentId} />
    </AssetDropTarget>
  )
}
