import { designatedIn } from '@/engines/timeline/timelineState'
import { layerById } from '@/engines/canvas/canvasState'
import { canvasOf, canvasStore, useCanvases } from '@/stores/canvases'
import {
  activeCharacterAssetId,
  activeImageId,
  activeSceneId,
  activeMontageId,
  activeSkyboxId,
  activeMaterialId,
  useDocuments,
} from '@/stores/documents'
import { sequenceOf, useSequences } from '@/stores/sequences'
import { ClipInspector } from '../../../timeline/components/ClipInspector'
import { CanvasInspector } from '../../../image/components/Canvas/CanvasInspector'
import { LayerInspector } from '../../../image/components/Layer/LayerInspector'
import { SceneInspector } from '../../../scene/components/Scene/SceneInspector'
import { CharacterInspector } from '../../../character/components/Character/Inspector/CharacterInspector'
import { SkyboxInspector } from '../../../skybox/components/Skybox/Inspector/SkyboxInspector'
import { MaterialInspector } from '../../../material/components/Material/Inspector/MaterialInspector'
import { TrackInspector } from '../../../timeline/components/Track/TrackInspector'
import { InspectorEmpty } from './InspectorEmpty'

/**
 * 🛑 The DOCUMENT in front decides, and everything it shows is read from that document — nothing
 * here asks the studio's global descriptor anything. An asset opens under its own row of the
 * shelf (`AssetDetails`), and a file is read in the information window.
 *
 * The order below is a reading order and not a priority: `activeIdOfKind` answers off one
 * `activeId`, so at most one of these ids is ever set.
 */
export function InspectorFace() {
  const sceneId = useDocuments(activeSceneId)
  // The MONTAGE in front, not the sequence: the Audio workspace shows one too, and reading only
  // the sequence left every clip and track picked there with an empty inspector.
  const sequenceId = useDocuments(activeMontageId)
  const sequence = useSequences(state => (sequenceId ? sequenceOf(state, sequenceId) : null))
  const textureId = useDocuments(activeMaterialId)
  const skyboxId = useDocuments(activeSkyboxId)
  // The ASSET and not the document: a character tab edits a model of the library, and everything
  // this face reads — the skeleton, its motions — is filed under it.
  const characterAssetId = useDocuments(activeCharacterAssetId)
  const imageId = useDocuments(activeImageId)
  // `hasState` first: `canvasOf` falls back to the default canvas, and a document still being
  // read would offer its fields to edit — an entry ⌘Z would then swap the loaded file for.
  const canvas = useCanvases(state =>
    imageId && canvasStore.hasState(state, imageId) ? canvasOf(state, imageId) : null,
  )

  const documentInspector =
    canvasInspector(imageId, canvas) ?? sequenceInspector(sequenceId, sequence)
  if (documentInspector) return documentInspector
  return otherInspector(sceneId, characterAssetId, skyboxId, textureId)
}

function canvasInspector(imageId: string | null, canvas: ReturnType<typeof canvasOf> | null) {
  if (!imageId || !canvas) return null
  const layer = layerById(canvas, canvas.activeLayerId)
  return (
    <>
      <CanvasInspector key={imageId} documentId={imageId} canvas={canvas} />
      {layer && <LayerInspector documentId={imageId} layer={layer} />}
    </>
  )
}

function sequenceInspector(
  sequenceId: string | null,
  sequence: ReturnType<typeof sequenceOf> | null,
) {
  if (!sequenceId || !sequence) return null
  const designated = designatedIn(sequence)
  if (designated?.kind === 'track')
    return <TrackInspector documentId={sequenceId} track={designated.track} />
  return designated ? (
    <ClipInspector documentId={sequenceId} sequence={sequence} clip={designated.clip} />
  ) : (
    <InspectorEmpty />
  )
}

function otherInspector(
  sceneId: string | null,
  characterId: string | null,
  skyboxId: string | null,
  textureId: string | null,
) {
  if (sceneId) return <SceneInspector documentId={sceneId} />
  if (characterId) return <CharacterInspector assetId={characterId} />
  if (skyboxId) return <SkyboxInspector documentId={skyboxId} />
  return textureId ? <MaterialInspector documentId={textureId} /> : <InspectorEmpty />
}
