import type { GroundPaint } from '@shared/domain/groundPaint'
import type { GroundMaterialChannel, SceneWorld } from '@shared/domain/scene'
import { groundPaintedAt, type HeldGroundPaint } from './sceneSurfacePaint'

type Disk = { x: number; z: number; radius: number; amount: number; falloff: number }

export type SceneGroundPaintSession = {
  clear: () => void
  rebind: (world: SceneWorld) => void
  paint: (terrainId: string, disk: Disk, channel: GroundMaterialChannel) => Promise<boolean>
  finish: () => Promise<void>
}

export function createSceneGroundPaintSession(options: {
  world: () => SceneWorld
  load?: (terrainId: string) => Promise<GroundPaint | null>
  apply: (terrainId: string, paint: GroundPaint) => void
}): SceneGroundPaintSession {
  const held = new Map<string, HeldGroundPaint>()
  let task: Promise<boolean> = Promise.resolve(false)
  return {
    clear: () => held.clear(),
    rebind: world => {
      for (const [terrainId, entry] of held) {
        held.set(terrainId, { ...entry, assetId: assetIdOf(world, terrainId) })
      }
    },
    paint: (terrainId, disk, channel) => {
      task = paintAfter(task, options, held, terrainId, disk, channel)
      return task
    },
    finish: async () => {
      await task
    },
  }
}

async function paintAfter(
  previous: Promise<boolean>,
  options: {
    world: () => SceneWorld
    load?: (terrainId: string) => Promise<GroundPaint | null>
    apply: (terrainId: string, paint: GroundPaint) => void
  },
  held: Map<string, HeldGroundPaint>,
  terrainId: string,
  disk: Disk,
  channel: GroundMaterialChannel,
): Promise<boolean> {
  await previous
  const world = options.world()
  const paint = await groundPaintedAt(world, held, options.load, terrainId, disk, channel)
  if (!paint) return false
  held.set(terrainId, { assetId: assetIdOf(world, terrainId), paint })
  options.apply(terrainId, paint)
  return true
}

function assetIdOf(world: SceneWorld, terrainId: string): string | null {
  const terrain = world.layers.find(item => item.kind === 'relief' && item.id === terrainId)
  if (terrain?.kind !== 'relief') return null
  return terrain.groundWeights?.assetId ?? terrain.groundMaterials[0]?.albedo.assetId ?? null
}
