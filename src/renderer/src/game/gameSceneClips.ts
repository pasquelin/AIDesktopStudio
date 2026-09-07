import type { Object3D } from 'three'
import type { ModelRef } from '@shared/domain/sceneModel'
import { clipKeyOf, type ClipSource } from '@shared/domain/scene'
import { orElse } from '@shared/promises'
import type { AssetPort } from '@game/ports/assetPort'
import type { ModelSource } from '@/engines/scene/modelCache'
import type { SceneResources } from './gameSceneResources'

/** One file to read, the clip wanted out of it, and the key it will be filed under. */
type AskedClip = { key: string; at: number; held: Promise<Object3D> }

/**
 * 🛑 `asset` sources alone: an exported game serves no `animation://`, so a clip a graph named as
 * shipped was rewritten to an asset of the bundle at export time — see `bundledGraphs`.
 */
export async function loadModelAnimations(
  nodeId: string,
  model: ModelRef,
  assets: AssetPort,
  loadModel: ModelSource,
  resources: SceneResources,
  wanted: readonly ClipSource[] = [],
): Promise<void> {
  const asked = askedClipsOf(model, assets, loadModel, resources, wanted)
  // 🛑 Awaited TOGETHER and filed in ORDER: the files are independent round trips, and reading
  // them one after another is what made a scene of ten characters wait for eighty. What a node
  // can play is a record, so resolution order would otherwise decide what a band lists first.
  //
  // Per file, and silent on purpose: one clip whose model fails to load must not take the clips
  // beside it down, and `createModelOf` already reports what a model failing to load costs.
  const loaded = await Promise.all(asked.map(one => orElse<Object3D | null>(one.held, null)))

  for (const [index, one] of asked.entries()) {
    const selected = loaded[index]?.animations[one.at]
    if (selected) resources.animations.addClip(nodeId, one.key, selected)
  }
}

/**
 * 🛑 Through `resources.models`, exactly as `createModelOf` does: the file was read again for
 * every node naming it, so ten characters sharing eight clips paid eighty fetch-and-parses. The
 * tree BELONGS to that map now — `dispose` frees it — where this used to dispose its own.
 */
function askedClipsOf(
  model: ModelRef,
  assets: AssetPort,
  loadModel: ModelSource,
  resources: SceneResources,
  wanted: readonly ClipSource[],
): AskedClip[] {
  const lanes = (model.lanes ?? []).flatMap(lane => lane.clips.map(clip => clip.source))
  const seen = new Set<string>()
  const asked: AskedClip[] = []

  for (const source of [...lanes, ...wanted]) {
    const key = clipKeyOf(source)
    if (source.kind !== 'asset' || seen.has(key)) continue
    seen.add(key)
    const url = assets.urlOf({ kind: 'asset', id: source.assetId })
    if (!url) continue
    const held = resources.models.get(source.assetId) ?? loadModel(url)
    resources.models.set(source.assetId, held)
    asked.push({ key, at: source.clipIndex ?? 0, held })
  }

  return asked
}
