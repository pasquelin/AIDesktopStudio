import { TEXTURE_SLOTS, type MaterialDescriptor } from '@shared/domain/scene'
import type { SceneNode, SceneState } from '@/engines/scene/sceneState'
import { lossyCandidatesOf } from '@/engines/scene/worldAnalyzer'

/** Asset ids the standalone runtime can reach, in deterministic first-use order. */
export function runtimeAssetIds(state: SceneState): readonly string[] {
  const found = new Set<string>()
  for (const node of state.nodes) {
    if (node.type === 'mesh' || node.type === 'carved') assetOfMaterial(node.material, found)
    if (node.type === 'model') {
      found.add(node.model.assetId)
      for (const lane of node.model.lanes ?? []) {
        for (const clip of lane.clips) {
          if (clip.source.kind === 'asset') found.add(clip.source.assetId)
        }
      }
    }
  }
  for (const layer of state.world.layers) {
    if (layer.kind === 'relief') found.add(layer.heightmap.assetId)
    if (layer.kind === 'scatter') {
      for (const asset of layer.assets) found.add(asset.assetId)
    }
  }
  for (const row of state.animation.audio ?? []) found.add(row.assetId)
  for (const row of state.animation.video ?? []) found.add(row.assetId)
  found.delete('')
  return [...found]
}

/**
 * Pixel assets whose resolution or encoding an explicitly LOSSY export may replace. Nodes rather
 * than a scene, so an export weighs the whole project at once: an asset shared by two scenes is
 * one asset, and one verdict.
 */
export function runtimeTextureAssetIds(nodes: readonly SceneNode[]): readonly string[] {
  return lossyCandidatesOf(nodes).textureCandidates.map(candidate => candidate.assetId)
}

/**
 * Imported geometry assets eligible for an explicit model simplification pass.
 *
 * 🛑 One `exclude` protects the asset EVERYWHERE, as it already does for textures: the bytes are
 * shared, so simplifying them for the ten nodes that allow it would rewrite them for the one that
 * does not.
 */
export function runtimeModelAssetIds(nodes: readonly SceneNode[]): readonly string[] {
  const found = new Set<string>()
  const protectedIds = new Set<string>()
  for (const node of nodes) {
    if (node.type !== 'model') continue
    ;(node.optimization?.mode === 'exclude' ? protectedIds : found).add(node.model.assetId)
  }
  for (const id of protectedIds) found.delete(id)
  found.delete('')
  return [...found]
}

function assetOfMaterial(material: MaterialDescriptor, found: Set<string>): void {
  for (const slot of TEXTURE_SLOTS) {
    const ref = material[slot]
    if (ref) found.add(ref.assetId)
  }
}
