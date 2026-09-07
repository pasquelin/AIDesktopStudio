import type { Camera, Scene } from 'three'
import type { HeightmapSamples } from '@shared/domain/heightmap'
import { enabledScatters, enabledTerrains, type SceneWorld } from '@shared/domain/scene'
import type { AssetPort } from '@game/ports/assetPort'
import { createRefCache } from '@/engines/core/refCache'
import { createReliefSurface, type ReliefSurface } from '@/engines/scene/reliefSurface'
import { createScatterSurface } from '@/engines/scene/scatterSurface'
import { disposeTree, type ModelSource } from '@/engines/scene/modelCache'

export type WorldDrape = {
  hideGround: boolean
  /**
   * Prunes the scatter to what the camera reaches — a game draws its own way and must ask.
   * Answers whether a cell went out or came back, which is a picture to draw again.
   */
  updateVisibility: (camera: Camera) => boolean
  dispose: () => void
}

export async function drapeWorld(
  scene: Scene,
  world: SceneWorld,
  assets: AssetPort,
  loadModel: ModelSource | undefined,
  heightmaps: ReadonlyMap<string, HeightmapSamples> | undefined,
): Promise<WorldDrape> {
  const terrains = enabledTerrains(world.layers)
  const scatters = enabledScatters(world.layers)
  const relief = terrains.length === 0 ? null : await drapeRelief(scene, world, heightmaps)
  const maps = heightmaps ?? relief?.heightmaps()
  const models = scatters.length === 0 ? null : scatterModels(assets, loadModel)
  const scatter = models
    ? createScatterSurface(scene, { models, onUnsupported: () => undefined })
    : null
  if (scatter) await scatter.sync(world, maps)
  return {
    hideGround: terrains.length > 0 && (maps?.size ?? 0) > 0,
    // The `changed` it answers keeps the STUDIO's loop alive; a game draws the frame on it. Never a
    // shadow pass: a cell casts nothing, and one toggles at SCATTER_DISTANCE, past any frustum.
    updateVisibility: camera => scatter?.updateVisibility(camera) ?? false,
    dispose: () => {
      scatter?.dispose()
      relief?.dispose()
      models?.dispose()
    },
  }
}

async function drapeRelief(
  scene: Scene,
  world: SceneWorld,
  heightmaps: ReadonlyMap<string, HeightmapSamples> | undefined,
): Promise<ReliefSurface> {
  const wanted = enabledTerrains(world.layers).filter(terrain =>
    heightmaps?.has(terrain.heightmap.assetId),
  ).length
  let settle: () => void = () => undefined
  const ready = new Promise<void>(resolve => {
    settle = resolve
  })
  const finish = (): void => {
    if (wanted === 0 || relief.heightmaps().size >= wanted) settle()
  }
  const relief = createReliefSurface(scene, {
    load: async assetId => {
      const samples = heightmaps?.get(assetId)
      if (!samples) throw new Error(assetId)
      return samples
    },
    onReady: finish,
    onFailure: settle,
  })
  relief.sync(world)
  finish()
  await ready
  return relief
}

function scatterModels(assets: AssetPort, loadModel: ModelSource | undefined) {
  return createRefCache({
    load: async (assetId: string) => {
      const url = assets.urlOf({ kind: 'asset', id: assetId })
      if (!url || !loadModel) throw new Error(assetId)
      return loadModel(url)
    },
    free: disposeTree,
    onFailure: () => undefined,
  })
}
