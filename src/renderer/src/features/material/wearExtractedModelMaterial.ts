import { workshopIdOf } from '@shared/domain/character'
import { dressCharacterStage } from '@/character/characterStage'
import { wearCharacterMaterialAt } from '@/engines/character/characterCommands'
import { wearMaterialAt } from '@/engines/scene/commands'
import { characterOf, useCharacters } from '@/stores/character'
import { sceneEngineOf } from '@/stores/sceneEngines'
import { sceneOf, useScenes } from '@/stores/scenes'

export function wearExtractedModelMaterial(
  assetId: string,
  slot: number,
  materialId: string,
): void {
  const scenes = useScenes.getState()
  for (const [documentId, scene] of Object.entries(scenes.states)) {
    const nodes = scene.nodes.filter(
      node => node.type === 'model' && node.model.assetId === assetId,
    )
    if (nodes.length === 0) continue
    for (const node of nodes)
      scenes.runCommand(documentId, wearMaterialAt(node.id, slot, materialId))
    sceneEngineOf(documentId)?.apply(sceneOf(useScenes.getState(), documentId))
  }

  const characters = useCharacters.getState()
  if (!characters.states[assetId]) return
  characters.runCommand(assetId, wearCharacterMaterialAt(slot, materialId))
  const dress = characterOf(useCharacters.getState(), assetId).dress
  dressCharacterStage(assetId, dress)
  const workshopId = workshopIdOf(assetId)
  sceneEngineOf(workshopId)?.apply(sceneOf(useScenes.getState(), workshopId))
}
