import type { ModelRef } from '@shared/domain/sceneModel'
import { clipKeyOf, type ClipSource } from '@shared/domain/scene'
import type { AssetPort } from '@game/ports/assetPort'
import type { SceneAnimations } from '@/engines/scene/animation'
import { disposeTree, type ModelSource } from '@/engines/scene/modelCache'

/**
 * 🛑 `asset` sources alone: an exported game serves no `animation://`, so a clip a graph named as
 * shipped was rewritten to an asset of the bundle at export time — see `bundledGraphs`.
 */
export async function loadModelAnimations(
  nodeId: string,
  model: ModelRef,
  assets: AssetPort,
  loadModel: ModelSource,
  animations: SceneAnimations,
  wanted: readonly ClipSource[] = [],
): Promise<void> {
  const lanes = (model.lanes ?? []).flatMap(lane => lane.clips.map(clip => clip.source))
  const seen = new Set<string>()

  for (const source of [...lanes, ...wanted]) {
    const key = clipKeyOf(source)
    if (source.kind !== 'asset' || seen.has(key)) continue
    seen.add(key)
    const url = assets.urlOf({ kind: 'asset', id: source.assetId })
    if (!url) continue
    try {
      const loaded = await loadModel(url)
      const selected = loaded.animations[source.clipIndex ?? 0]
      if (selected) animations.addClip(nodeId, key, selected)
      disposeTree(loaded)
    } catch {
      continue
    }
  }
}
