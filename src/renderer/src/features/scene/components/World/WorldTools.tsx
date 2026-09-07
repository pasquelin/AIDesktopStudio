import type { ReliefLayer, ScatterLayer } from '@shared/domain/scene'
import { sceneOf, useScenes } from '@/stores/scenes'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'
import { WorldToolsBrushes } from './WorldToolsBrushes'
import { WorldToolsGroundMaterials } from './WorldToolsGroundMaterials'
import { WorldToolsMask } from './WorldToolsMask'
import { WorldToolsScatter } from './WorldToolsScatter'

/** Contextual sculpt tools for the armed terrain, edit, or scatter. */
export function WorldTools({ documentId }: { documentId: string }) {
  const armed = useSceneViews(state => sceneViewOf(state, documentId).armedWorld)
  const layers = useScenes(state => sceneOf(state, documentId).world.layers)
  if (armed?.kind === 'scatter') {
    const scatter = layers.find(
      (layer): layer is ScatterLayer => layer.kind === 'scatter' && layer.id === armed.id,
    )
    if (!scatter) return null
    return <WorldToolsScatter documentId={documentId} scatter={scatter} />
  }
  const terrain = layers.find(
    (layer): layer is ReliefLayer => layer.kind === 'relief' && layer.id === armed?.id,
  )
  const edit = terrain?.edits.find(one => one.id === armed?.editId)
  if (!armed || !terrain) return null
  return (
    <>
      <WorldToolsBrushes documentId={documentId} terrain={terrain} edit={edit} />
      <WorldToolsGroundMaterials documentId={documentId} terrain={terrain} />
      {edit ? <WorldToolsMask documentId={documentId} terrain={terrain} edit={edit} /> : null}
    </>
  )
}
