import { setComponentField } from '@/engines/scene/commands'
import { gltfDocumentOf } from '@/engines/scene/gltfDocument'
import { playerModuleFileOf } from '@/engines/scene/playerModule'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'
import { sceneOf, useScenes } from '@/stores/scenes'

/**
 * Files the module as a glTF of its own, and marks it with the file it now comes from. The nodes
 * stay written in the scene too: a strict reader opens both.
 */
export async function fileModuleOf(documentId: string): Promise<void> {
  const scene = sceneOf(useScenes.getState(), documentId)
  const module = playerModuleFileOf(scene.nodes)
  const root = module?.[0]
  if (!module || !root) return

  const written = gltfDocumentOf(
    { ...EMPTY_SCENE, nodes: [...module] },
    { documentId, documentKind: 'scene' },
  )

  try {
    const asset = await getBridge()?.assets.savePlayerModule({
      name: root.name,
      gltf: JSON.stringify(written),
    })
    if (!asset) return

    useScenes
      .getState()
      .runCommand(
        documentId,
        setComponentField(root.id, 'Player', 'from', asset.path ?? asset.name),
      )
  } catch (error) {
    reportFailure('scene.player', root.name, error)
  }
}
