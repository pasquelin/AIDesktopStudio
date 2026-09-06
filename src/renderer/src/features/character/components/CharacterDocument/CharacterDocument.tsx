import { Button } from '@/components/Button'
import { SceneSpeedControl } from '@/features/scene/components/Scene/SceneSpeedControl'
import { useRetargetHost } from '@/features/retarget/hooks/useRetargetHost'
import { restoreStoredRig } from '@/character/restoreStoredRig'
import { mdiSkull } from '@mdi/js'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CommandId } from '@shared/domain/command'
import { DEFAULT_SETTINGS, type Settings } from '@shared/domain/settings'
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
import { createCharacterStage, dressCharacterStage } from '@/character/characterStage'
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
import { useModelFiles } from '@/stores/modelFiles'
import { useSceneRendererResources } from '@/features/scene/components/Scene/Document/hooks/useSceneRendererResources'
import { SceneClock } from '@/features/scene/components/Scene/SceneClock'
import { SceneNavigationHint } from '@/features/scene/components/Scene/SceneNavigationHint'
import { CHARACTER_EDIT_REST, CHARACTER_STATE_TOOLS, CHARACTER_TOOLS } from './characterTools'

/**
 * The decor is this tab's own — it shows bones on a grid, never the studio's helpers. The two
 * NAVIGATION preferences are the person's, and follow them here as they do in a scene.
 */
function characterViewport(three: Settings['three']): Settings['three'] {
  return {
    ...DEFAULT_SETTINGS.three,
    orbitAroundSelection: three.orbitAroundSelection,
    orbitUnderCursor: three.orbitUnderCursor,
    showGrid: true,
    lightHelpers: 'off',
    cameraHelpers: 'off',
    boundingBoxes: 'off',
  }
}

function runCharacterCommand(
  assetId: string,
  command: CommandId,
  setNavigating: (update: (current: boolean) => boolean) => void,
): void {
  const store = useCharacters.getState()
  if (command === 'character.undo') store.undo(assetId)
  if (command === 'character.redo') store.redo(assetId)
  if (command === 'character.navigate') setNavigating(current => !current)
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
  const view = useCharacterView(state => characterViewOf(state, assetId))
  const inFront = useDocumentIsInFront(documentId)
  useDocumentTitle(
    documentId,
    useCharacters(state => isCharacterDirty(state, assetId)),
  )
  useRestoredDocument(documentId)
  useSceneRendererResources(engineRef, { models: false }) // reloading its own file loses the pose
  const [navigating, setNavigating] = useState(false)
  /** Metres per second the wheel left the flight at, or `null` while it has said nothing. */
  const [flySpeed, setFlySpeed] = useState<number | null>(null)

  useShortcuts({
    scope: 'character',
    enabled: inFront,
    onCommand: command => runCharacterCommand(assetId, command, setNavigating),
    // 🛑 The same camera as the studio's viewport. Without these two the keys reached no engine
    // at all: this surface orbited and nothing else, where every other 3D one flies.
    onMotionChange: held => engineRef.current?.setMotion(held),
    isFlying: () => engineRef.current?.flying ?? false,
  })

  useEffect(() => {
    engineRef.current?.setNavigating(navigating)
  }, [navigating, live])

  useEffect(() => {
    engineRef.current?.setMode(view.mode)
  }, [view.mode, live])

  // 🛑 The padlocks reach the DRAG, not just the release: unheld for the length of a gesture, a
  // joint leaves the axis a hand meant to keep it on — seen on screen the 2026-09-02.
  useEffect(() => {
    engineRef.current?.setHeldBoneAxes(view.heldAxes)
  }, [view.heldAxes, live])

  // 🛑 The rest is put back BEFORE the engine measures the skins against it: a bone left where a
  // pose placed it would be bound there, and that pose would become the character's own shape.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !nodeId) return

    if (view.editingRest)
      for (const bone of characterOf(useCharacters.getState(), assetId).rig?.bones ?? [])
        engine.poseBone(nodeId, bone.name, bone.rest)

    engine.setRestEditing(view.editingRest)
  }, [view.editingRest, assetId, nodeId, live])

  useEffect(() => {
    if (!nodeId || name === assetId) return

    const scene = sceneOf(useScenes.getState(), workshopId)
    if (nodeById(scene, nodeId)?.name === name) return

    useScenes.getState().runCommand(workshopId, renameNode(nodeId, name))
  }, [assetId, name, nodeId, workshopId])

  // 🛑 What puts a gizmo on a joint, and paints it as the chosen one. Without it the engine hears
  // its own pick back from nobody: a bone could be named by the panel and still not be held.
  useEffect(() => {
    engineRef.current?.setPickedBone(
      view.pickedBone && nodeId ? { nodeId, bone: view.pickedBone } : null,
    )
  }, [view.pickedBone, nodeId, live])

  // 🛑 The skeleton the store holds, put ON the model. Without this a fitted rig lives in a
  // state nobody draws, no weights are ever worked out, and ⌘S writes bones bound to nothing.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !nodeId || landedAssetId !== assetId) return
    if (!character.rig) {
      engine.clearRig(nodeId)
      return
    }
    void restoreStoredRig(engine, nodeId, character.rig, character.autoRigBindings)
  }, [character.rig, character.autoRigBindings, nodeId, live, landedAssetId, assetId])

  useEffect(() => {
    dressCharacterStage(assetId, character.dress)
  }, [assetId, character.dress])

  // Its own effect: the one that mounts the renderer must not run again for a preference.
  useEffect(() => {
    engineRef.current?.configure(characterViewport(three))
  }, [three])

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
    renderer.configure(characterViewport(useSettings.getState().settings.three))

    // Armed from the first frame: this tab is ABOUT the bones, where a scene draws them on
    // demand. A click picks a joint, and the gizmo it hands it to MOVES it — a skeleton is
    // edited by placing its joints, where a scene poses one by turning them.
    renderer.setSkeletons(true)
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
        tools={[
          ...CHARACTER_TOOLS,
          // Exactly one lit, like the verbs above: the two states are exclusive.
          ...CHARACTER_STATE_TOOLS.map(tool => ({
            ...tool,
            pressed: (tool.id === CHARACTER_EDIT_REST) === view.editingRest,
          })),
        ]}
        activeTool={view.mode}
        onTool={id => {
          const store = useCharacterView.getState()
          if (CHARACTER_STATE_TOOLS.some(tool => tool.id === id)) {
            store.editCharacterRest(assetId, id === CHARACTER_EDIT_REST)
            return
          }

          const chosen = CHARACTER_TOOLS.find(tool => tool.id === id)
          if (chosen) store.setCharacterMode(assetId, chosen.mode)
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
