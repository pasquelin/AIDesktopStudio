import type { HeightmapSamples } from '@shared/domain/heightmap'
import type { WorldLayer } from '@shared/domain/scene'
import { loadHeightmap } from '@/engines/scene/heightmap'

/**
 * Heightmaps a Play needs, keyed by asset. A file that will not decode is omitted — `groundOf`
 * then has no heightfield, and the cuboid only if the plane is shown.
 */
export async function heightmapsOf(
  layers: readonly WorldLayer[],
  load: (assetId: string) => Promise<HeightmapSamples> = loadHeightmap,
): Promise<Map<string, HeightmapSamples>> {
  const maps = new Map<string, HeightmapSamples>()
  for (const layer of layers) {
    if (layer.kind !== 'relief' || maps.has(layer.heightmap.assetId)) continue
    try {
      maps.set(layer.heightmap.assetId, await load(layer.heightmap.assetId))
    } catch {
      // Named rather than thrown: Play still starts, and `groundOf` says the physics has no grid.
    }
  }
  return maps
}
