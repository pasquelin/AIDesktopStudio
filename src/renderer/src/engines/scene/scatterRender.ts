import { LOD, Object3D, type Mesh } from 'three'
import { DEFAULT_OPTIMIZATION_POLICY } from '@shared/domain/optimizationPolicy'
import { scatterHash, type ScatterPose } from '@shared/domain/scatterGenerate'
import type { ScatterCategory } from '@shared/domain/scene'
import { bakedInstancesOf } from './bakedInstances'
import type { BakedInstance } from './sceneState'
import { CELL_SIZE, cellCoords, cellKey, type CellKey, type WorldPartition } from './worldPartition'

export type ScatterBatch = {
  assetId: string
  cell: CellKey
  cellSize: number
  category: ScatterCategory
  seed: number
  poses: readonly ScatterPose[]
}

/** At 10/m², 32 m caps a full grass cell at 10,240 candidates instead of 655,360 at 256 m. */
export const GRASS_CELL_SIZE = 32

export type ScatterDensityLevel = { density: number; distanceMultiplier: number }

export const GRASS_DENSITY_LEVELS: readonly ScatterDensityLevel[] = [
  { density: 1, distanceMultiplier: 0 },
  { density: 0.5, distanceMultiplier: 4 },
  { density: 0.25, distanceMultiplier: 8 },
  { density: 0.1, distanceMultiplier: 16 },
  { density: 0, distanceMultiplier: 24 },
]

export function scatterCellSize(category: ScatterCategory): number {
  return category === 'grass' ? GRASS_CELL_SIZE : CELL_SIZE
}

export function scatterBatchKey(assetId: string, cell: CellKey): string {
  return `${assetId}:${cell}`
}

export function scatterBatchesOf(
  poses: readonly ScatterPose[],
  cellAt: (x: number, z: number) => CellKey = defaultCellAt,
  cellSize = CELL_SIZE,
  category: ScatterCategory = 'props',
  seed = 1,
): readonly ScatterBatch[] {
  const groups = new Map<string, { assetId: string; cell: CellKey; poses: ScatterPose[] }>()
  for (const pose of poses) {
    const cell = cellAt(pose.x, pose.z)
    const key = scatterBatchKey(pose.assetId, cell)
    const held = groups.get(key)
    if (held) {
      held.poses.push(pose)
      continue
    }
    groups.set(key, { assetId: pose.assetId, cell, poses: [pose] })
  }
  return [...groups.values()].map(group => ({ ...group, cellSize, category, seed }))
}

export function scatterDrawnOf(batch: ScatterBatch, source: Mesh): LOD {
  const { cx, cz } = cellCoords(batch.cell)
  const centre = { x: (cx + 0.5) * batch.cellSize, z: (cz + 0.5) * batch.cellSize }
  const lod = new LOD()
  lod.name = `scatter-${scatterBatchKey(batch.assetId, batch.cell)}`
  lod.position.set(centre.x, 0, centre.z)
  const full = instancesOf(batch.poses, centre, source)
  full.computeBoundingSphere()
  const radius = full.boundingSphere?.radius ?? 1
  const levels =
    batch.category === 'grass'
      ? grassDensityLevels(batch.poses, batch.seed)
      : propsDensityLevels(batch.poses)
  levels.forEach((level, index) => {
    const object =
      index === 0
        ? full
        : level.poses.length > 0
          ? instancesOf(level.poses, centre, source)
          : new Object3D()
    lod.addLevel(object, radius * level.distanceMultiplier)
  })
  return lod
}

export function grassDensityLevels(
  poses: readonly ScatterPose[],
  seed: number,
  policy: readonly ScatterDensityLevel[] = GRASS_DENSITY_LEVELS,
): readonly { poses: readonly ScatterPose[]; distanceMultiplier: number }[] {
  return policy.map(level => ({
    distanceMultiplier: level.distanceMultiplier,
    poses:
      level.density >= 1
        ? poses
        : level.density <= 0
          ? []
          : poses.filter(
              pose =>
                scatterHash(seed, Math.round(pose.x * 1_000), Math.round(pose.z * 1_000), 9) <
                level.density,
            ),
  }))
}

function propsDensityLevels(
  poses: readonly ScatterPose[],
): readonly { poses: readonly ScatterPose[]; distanceMultiplier: number }[] {
  return [
    { poses, distanceMultiplier: 0 },
    {
      poses: poses.filter((_pose, index) => index % 4 === 0),
      distanceMultiplier: DEFAULT_OPTIMIZATION_POLICY.lodDistanceMultipliers[0] ?? 12,
    },
    { poses: [], distanceMultiplier: DEFAULT_OPTIMIZATION_POLICY.lodDistanceMultipliers[1] ?? 36 },
  ]
}

function instancesOf(
  poses: readonly ScatterPose[],
  centre: { x: number; z: number },
  source: Mesh,
) {
  return bakedInstancesOf(
    source.geometry,
    source.material,
    bakedOf(poses, centre),
    source.matrixWorld,
  )
}

export function holdScatterCells(
  batches: readonly ScatterBatch[],
  partition: WorldPartition,
): void {
  const seen = new Set<CellKey>()
  for (const batch of batches) {
    if (seen.has(batch.cell)) continue
    seen.add(batch.cell)
    partition.hold(batch.cell)
  }
}

function bakedOf(
  poses: readonly ScatterPose[],
  centre: { x: number; z: number },
): readonly BakedInstance[] {
  return poses.map((pose, slot) => ({
    sourceId: `${slot}`,
    name: pose.assetId,
    transform: {
      position: { x: pose.x - centre.x, y: pose.y, z: pose.z - centre.z },
      rotation: pose.rotation,
      scale: { x: pose.scale, y: pose.scale, z: pose.scale },
    },
  }))
}

function defaultCellAt(x: number, z: number): CellKey {
  return cellKey(Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE))
}
