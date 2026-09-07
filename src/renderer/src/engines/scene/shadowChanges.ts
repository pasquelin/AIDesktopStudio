import { SHADOW_TEXTURE_SLOTS, type MaterialDescriptor } from '@shared/domain/scene'
import { type SceneNode } from './sceneState'

/**
 * Whether the depth map of a LIGHT has to be drawn again, from the two states of its node.
 *
 * A lamp whose colour or intensity moved throws the same shape from the same place: what the map
 * holds is still true, and only the beauty pass has to run.
 */
export function shadowOfLightMoved(previous: SceneNode | undefined, node: SceneNode): boolean {
  if (previous?.type !== 'light' || node.type !== 'light') return true
  if (
    previous.transform !== node.transform ||
    previous.visible !== node.visible ||
    previous.castShadow !== node.castShadow ||
    previous.parentId !== node.parentId ||
    previous.attach !== node.attach ||
    previous.light.kind !== node.light.kind
  ) {
    return true
  }

  if (previous.light.kind === 'directional' && node.light.kind === 'directional') {
    return previous.light.target !== node.light.target
  }
  if (previous.light.kind === 'point' && node.light.kind === 'point') {
    return previous.light.distance !== node.light.distance
  }
  if (previous.light.kind === 'spot' && node.light.kind === 'spot') {
    return (
      previous.light.distance !== node.light.distance ||
      previous.light.angle !== node.light.angle ||
      previous.light.target !== node.light.target
    )
  }
  return false
}

/** The same question for anything a light throws onto: only a moved SILHOUETTE changes a map. */
export function shadowOfNodeMoved(previous: SceneNode | undefined, node: SceneNode): boolean {
  if (!previous || previous.type !== node.type) return true
  if (node.type === 'light') return shadowOfLightMoved(previous, node)
  if (
    previous.transform !== node.transform ||
    previous.visible !== node.visible ||
    previous.castShadow !== node.castShadow ||
    previous.parentId !== node.parentId ||
    previous.attach !== node.attach
  ) {
    return true
  }

  if (previous.type === 'mesh' && node.type === 'mesh') {
    return (
      previous.geometry !== node.geometry || shadowMaterialMoved(previous.material, node.material)
    )
  }
  if (previous.type === 'text' && node.type === 'text') {
    return previous.text !== node.text || shadowMaterialMoved(previous.material, node.material)
  }
  if (previous.type === 'carved' && node.type === 'carved') {
    return previous.carved !== node.carved || shadowMaterialMoved(previous.material, node.material)
  }
  if (previous.type === 'model' && node.type === 'model') return previous.model !== node.model
  if (previous.type === 'path' && node.type === 'path') return previous.path !== node.path
  return false
}

/** Only the maps a depth pass reads: a colour is not a shape, a displacement is. */
function shadowMaterialMoved(previous: MaterialDescriptor, material: MaterialDescriptor): boolean {
  for (const slot of SHADOW_TEXTURE_SLOTS) {
    if (previous[slot]?.assetId !== material[slot]?.assetId) return true
  }
  return (
    previous.tilesPerMetre !== material.tilesPerMetre &&
    SHADOW_TEXTURE_SLOTS.some(slot => previous[slot] !== null || material[slot] !== null)
  )
}
