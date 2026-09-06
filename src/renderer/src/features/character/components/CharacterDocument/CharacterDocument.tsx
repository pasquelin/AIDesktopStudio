import { Button } from '@/components/Button'
import { mdiSkull } from '@mdi/js'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import type { CommandId } from '@shared/domain/command'
import { isDisplayMode } from '@shared/domain/scene'
import type { Transform } from '@shared/domain/transform'
import { EmptyState } from '@/components/EmptyState'
import { Toolbar } from '@/components/Toolbar/Toolbar'
import { PANE_TOOLBAR, PANE_TOOLBAR_ASIDE } from '@/components/styles'
import { SceneRenderer } from '@/engines/scene/SceneRenderer'
import { environmentDressOf } from '@/features/skybox/components/environmentDress'
import {
  extractedModelDress,
  prepareExtractedModelDress,
  wornModelDress,
} from '@/features/material/modelDress'
import { workshopIdOf } from '@shared/domain/character'
import { createCharacterStage } from '@/character/characterStage'
import { noteCharacterSkins } from '@/character/characterSkins'
import { assetsById, assetVersionOf, useAssets } from '@/stores/assets'
import { useShortcuts } from '@/hooks/useShortcuts'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useRestoredDocument } from '@/hooks/useRestoredDocument'
import { restWithin } from '@/engines/character/boneRest'
import { setCharacterBoneRest } from '@/engines/character/characterCommands'
import { characterOf, isCharacterDirty, useCharacters } from '@/stores/character'
import { characterViewOf, useCharacterView } from '@/stores/characterView'
import { characterAssetOf, useDocuments, useDocumentIsInFront } from '@/stores/documents'
import { useSettings } from '@/stores/settings'
import { nodeById } from '@/engines/scene/sceneState'
import { renameNode } from '@/engines/scene/commands'
import { forgetSceneEngine, registerSceneEngine } from '@/stores/sceneEngines'
import { sceneOf, useScenes } from '@/stores/scenes'
import { sceneViewChromeOf } from '@/stores/sceneViewChrome'
import { MAIN_SCENE_PANE, useSceneViews } from '@/stores/sceneViews'
import { useModelFiles } from '@/stores/modelFiles'
import { useSceneRendererResources } from '@/features/scene/components/Scene/Document/hooks/useSceneRendererResources'
import { useSceneDocumentExports } from '@/features/scene/components/Scene/Document/hooks/useSceneDocumentExports'
import { NAVIGATE_TOOL } from '@/features/scene/components/Scene/sceneTools'
import { SceneClock } from '@/features/scene/components/Scene/SceneClock'
import { SceneNavigationHint } from '@/features/scene/components/Scene/SceneNavigationHint'
import { SceneSpeedControl } from '@/features/scene/components/Scene/SceneSpeedControl'
import { useRetargetHost } from '@/features/retarget/hooks/useRetargetHost'
import {
  CHARACTER_EDIT_REST,
  CHARACTER_STATE_TOOLS,
  WORKSHOP_TOOLS,
  workshopBar,
} from './characterTools'
import { useCharacterEngineState } from './hooks/useCharacterEngineState'
import { useCharacterRig } from './hooks/useCharacterRig'
import { useWorkshopViewState } from './hooks/useWorkshopViewState'
import { runWorkshopCommand } from './workshopCommands'

function runCharacterCommand(assetId: string, command: CommandId): void {
  const store = useCharacters.getState()
  if (command === 'character.undo') store.undo(assetId)
  if (command === 'character.redo') store.redo(assetId)
}

/**
 * One character, edited on its own tab: the model on a workshop floor, its skeleton in the
 * inspector and its motion along the band — both of them docks of the studio.
 *
 * It holds an ENGINE of its own and its subject is a FILE: the model of the library this tab was
 * opened on, which ⌘S patches — see `saveCharacterDocument`.
 */
export function CharacterDocument({ documentId }: { documentId: string }) {
  const { t } = useTranslation()

  const assetId = useDocuments(state => characterAssetOf(state, documentId)) ?? ''
  const openRetarget = useRetargetHost(assetId)
  const three = useSettings(state => state.settings.three)
  const hostRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<SceneRenderer | null>(null)
  // Beside the ref, and not instead of it: a ref never re-renders, and the clock is a component
  // that has to learn the engine exists — `SceneDocument` holds its own the same way.
  const [live, setLive] = useState<SceneRenderer | null>(null)
  const [landedAssetId, setLandedAssetId] = useState<string | null>(null)
  const character = useCharacters(state => characterOf(state, assetId))
  const name = useAssets(state => assetsById(state).get(assetId)?.name ?? assetId)
  // The workshop this tab lays the model on: a scene document of this window, which is what the
  // band, the motion picker and the preview all speak.
  const workshopId = workshopIdOf(assetId)
  const nodeId = useScenes(state => sceneOf(state, workshopId).nodes[0]?.id)
  const duration = useScenes(state => sceneOf(state, workshopId).animation.duration)
  const characterView = useCharacterView(state => characterViewOf(state, assetId))
  const view = useSceneViews(useShallow(state => sceneViewChromeOf(state, workshopId)))
  const inFront = useDocumentIsInFront(documentId)
  useDocumentTitle(
    documentId,
    useCharacters(state => isCharacterDirty(state, assetId)),
  )
  useRestoredDocument(documentId)
  useSceneRendererResources(engineRef, { models: false }) // reloading its own file loses the pose
  // On the WORKSHOP, which is the scene document the export rows address — the file they write
  // takes the asset's name, which the menu side of it settles.
  useSceneDocumentExports(inFront, workshopId)
  const [navigating, setNavigating] = useState(false)
  /** Metres per second the wheel left the flight at, or `null` while it has said nothing. */
  const [flySpeed, setFlySpeed] = useState<number | null>(null)
  // Rebuilt every render on purpose: a command reads the view of the render it fires in.
  const context = { assetId, workshopId, setNavigating, view }

  // Its OWN scope and not the scene's: ⌘Z on this tab must not reach the scene open beside it.
  // ⌘S is not here — `commandRouter` routes it to the document in front, and this kind writes
  // the model's own container.
  useShortcuts({
    scope: 'character',
    enabled: inFront,
    onCommand: command => runCharacterCommand(assetId, command),
    // 🛑 The same camera as the studio's viewport. Without these two the keys reached no engine
    // at all: this surface orbited and nothing else, where every other 3D one flies.
    onMotionChange: held => engineRef.current?.setMotion(held),
    isFlying: () => engineRef.current?.flying ?? false,
  })
  // The scene's keys and menu rows too, for what moves the VIEW: the bar declares the same
  // commands, and a document edit answers `false` here — see `runWorkshopCommand`.
  useShortcuts({
    scope: 'scene',
    enabled: inFront,
    documentId: workshopId,
    onCommand: command => runWorkshopCommand(command, context),
  })

  useCharacterEngineState(live, assetId, nodeId, characterView, navigating, three)
  useWorkshopViewState(live, view)
  useCharacterRig(live, assetId, nodeId, landedAssetId === assetId, character)

  useEffect(() => {
    if (!nodeId || name === assetId) return

    const scene = sceneOf(useScenes.getState(), workshopId)
    if (nodeById(scene, nodeId)?.name === name) return

    useScenes.getState().runCommand(workshopId, renameNode(nodeId, name))
  }, [assetId, name, nodeId, workshopId])

  useEffect(() => {
    const element = hostRef.current
    if (!element || assetId === '') return

    const renderer = new SceneRenderer({
      // A viewport click addresses the whole model root, never one virtual mesh from the tree.
      onSelect: () => useModelFiles.getState().selectPart(workshopId, null),
      // The gizmo's own report, once per gesture. A joint dragged is a joint that RESTS there:
      // the fit lands each one near enough off a bounding box, and this is the hand correcting it.
      onTransform: moves => {
        for (const move of moves) {
          if (!move.bone) continue
          // 🛑 The padlock bites on the gizmo too, not just on the fields: a hold the viewport
          // walked through would be a padlock that only draws itself.
          const kept = boneRestHeld(assetId, move.bone, move.transform)
          // The two gestures of this tab: editing writes the skeleton of the FILE, posing leaves
          // it untouched and lets the mesh follow — see `CHARACTER_REST_TOOL`.
          if (characterViewOf(useCharacterView.getState(), assetId).editingRest)
            useCharacters.getState().runCommand(assetId, setCharacterBoneRest(move.bone, kept))
          else engineRef.current?.poseBone(move.id, move.bone, kept)
        }
      },
      // 🛑 The engine leaves the flight on its own — Escape, a lost capture — and says so. Unheard,
      // the state stayed `true` and the next press of the key put `false` on a mode already over.
      onNavigatingChange: setNavigating,
      onFlySpeedChange: setFlySpeed,
      // The workshop is the character and a floor: the furniture of a scene has nothing to say
      // about a skeleton.
      chrome: false,
      assetVersion: assetVersionOf,
      wornDress: wornModelDress,
      defaultModelDress: extractedModelDress,
      prepareModelDress: prepareExtractedModelDress,
      environmentDress: environmentDressOf,
      onCharacter: (_nodeId, rig, extras, measured) => {
        useCharacterView.getState().noteCharacterSample(assetId, measured)
        stage.read(rig, extras)
      },
      onMaterials: (id, count, names, parts, hasFileTextures, sourceIndices) => {
        setLandedAssetId(assetId)
        useModelFiles
          .getState()
          .reportMaterials(workshopId, id, count, names, parts, hasFileTextures, sourceIndices)
      },
      onStats: stats => useModelFiles.getState().reportStats(workshopId, stats),
      onMorphs: (id, names) => useModelFiles.getState().reportMorphs(workshopId, id, names),
      // Kept for ⌘S: only the engine ever weighs a mesh against a rig, and the save runs from
      // `documentIo` — outside this tab.
      onSkinning: (_nodeId, weighed) => noteCharacterSkins(assetId, weighed),
      // A bone is not a node: it has no id in any document, and it is picked apart from anything
      // a scene would select — which is why the engine reports it on its own channel.
      onSelectBone: bone => useCharacterView.getState().pickBone(assetId, bone?.bone ?? null),
    })
    renderer.mount(element)
    engineRef.current = renderer
    setLive(renderer)
    // Published under the WORKSHOP, which is the document every other surface names it by: the
    // inspector and the band both sit in docks, outside this tab.
    registerSceneEngine(workshopId, renderer)

    // Armed from the first frame, and through the VIEW so the bar can put it out: this tab is
    // ABOUT the bones. The pose mode is forced rather than offered — a click picks a joint, and
    // the gizmo it hands it to MOVES it, which is how a skeleton is edited.
    useSceneViews.getState().setSkeletons(workshopId, true)
    renderer.setPoseMode(true)

    const stage = createCharacterStage({ renderer, assetId })

    return () => {
      engineRef.current = null
      setLive(null)
      forgetSceneEngine(workshopId)
      useModelFiles.getState().forget(workshopId)
      stage.close()
      renderer.dispose()
    }
  }, [assetId, workshopId])

  return (
    <div className="bg-monitor relative size-full overflow-hidden">
      <div ref={hostRef} className="absolute inset-0" />
      <Toolbar
        className={PANE_TOOLBAR}
        label={t('character.tools')}
        tools={workshopBar(view, characterView.editingRest)}
        activeTool={navigating ? NAVIGATE_TOOL : characterView.mode}
        onTool={id => {
          if (CHARACTER_STATE_TOOLS.some(tool => tool.id === id)) {
            useCharacterView.getState().editCharacterRest(assetId, id === CHARACTER_EDIT_REST)
            return
          }

          const chosen = WORKSHOP_TOOLS.find(tool => tool.id === id)
          if (chosen) runWorkshopCommand(chosen.command, context)
        }}
        onMode={(_toolId, modeId) => {
          if (isDisplayMode(modeId))
            useSceneViews.getState().setDisplay(workshopId, MAIN_SCENE_PANE, modeId)
        }}
      />
      {/* How fast the camera travels, the studio's own control: a workshop is a metre across and
          the preference is set for a scene, so a flight opened far too fast. */}
      <Toolbar
        orientation="horizontal"
        label={t('character.cameraSpeed')}
        className={PANE_TOOLBAR_ASIDE}
        extras={
          <>
            <Button onClick={() => void openRetarget()}>{t('character.retarget.title')}</Button>
            <SceneSpeedControl
              speed={flySpeed}
              onSpeed={speed => engineRef.current?.setFlySpeed(speed)}
            />
          </>
        }
      />
      {navigating && <SceneNavigationHint speed={flySpeed} />}
      {landedAssetId !== assetId && (
        <div className="pointer-events-none absolute inset-0">
          <EmptyState icon={mdiSkull} message={t('character.window.waiting')} />
        </div>
      )}

      {/* 🛑 What makes Play do anything at all: the head is React's, run forward by this and
          pushed into the engine by it. Without it the button armed a flag nobody read. */}
      <SceneClock documentId={workshopId} duration={duration} renderer={live} />
    </div>
  )
}

/**
 * What a gizmo just wrote, brought back within the holds this tab offers.
 *
 * Here rather than in the command: a command is what the MCP and the fields both run, and a hold
 * is a state of this VIEW — one bound into the command would hold an axis for a caller that
 * never closed a padlock.
 */
function boneRestHeld(assetId: string, bone: string, moved: Transform): Transform {
  const rested = characterOf(useCharacters.getState(), assetId).rig?.bones.find(
    one => one.name === bone,
  )?.rest

  return rested
    ? restWithin(rested, moved, characterViewOf(useCharacterView.getState(), assetId).heldAxes)
    : moved
}
