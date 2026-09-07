import type { HeightmapSamples } from './heightmap'
import { clamp } from '../numeric'
import { getHeightAt, type ReliefHeightLayer } from './relief'
import { enabledTerrains, type SceneWorld } from './scene'
import type { ScatterGround } from './scatterGenerate'

export function scatterTerrainsOf(
  world: SceneWorld,
  heightmaps: ReadonlyMap<string, HeightmapSamples>,
): readonly ReliefHeightLayer[] {
  return enabledTerrains(world.layers).flatMap(terrain => {
    const samples = heightmaps.get(terrain.heightmap.assetId)
    return samples ? [{ ...terrain, samples }] : []
  })
}

export const FLAT_SCATTER_GROUND: ScatterGround = {
  heightAt: () => 0,
  slopeAt: () => ({ degrees: 0, nx: 0, ny: 1, nz: 0 }),
}

export function scatterGroundOf(terrains: readonly ReliefHeightLayer[]): ScatterGround {
  return {
    heightAt: (x, z) => getHeightAt(terrains, x, z),
    slopeAt: (x, z) => slopeAt(terrains, x, z),
  }
}

/** Metres between the two samples a slope is read from. */
const SLOPE_REACH = 0.5

function slopeAt(
  terrains: readonly ReliefHeightLayer[],
  x: number,
  z: number,
): { degrees: number; nx: number; ny: number; nz: number } {
  const height = getHeightAt(terrains, x, z) ?? 0
  const east = getHeightAt(terrains, x + SLOPE_REACH, z) ?? height
  const north = getHeightAt(terrains, x, z + SLOPE_REACH) ?? height
  // Divided by the reach: read as a rise over one metre, a true 45° slope came back as 26.57°.
  const nx = (height - east) / SLOPE_REACH
  const nz = (height - north) / SLOPE_REACH
  const length = Math.hypot(nx, 1, nz) || 1
  return {
    degrees: Math.acos(clamp(1 / length, -1, 1)) * (180 / Math.PI),
    nx: nx / length,
    ny: 1 / length,
    nz: nz / length,
  }
}
