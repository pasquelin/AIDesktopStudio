import { BoxGeometry, InstancedMesh, LOD, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import type { ScatterPose } from '@shared/domain/scatterGenerate'
import {
  GRASS_CELL_SIZE,
  GRASS_DENSITY_LEVELS,
  grassDensityLevels,
  holdScatterCells,
  scatterBatchesOf,
  scatterDrawnOf,
} from './scatterRender'
import { buildPartition, cellKey, CELL_SIZE } from './worldPartition'

function pose(assetId: string, x: number, z: number): ScatterPose {
  return {
    assetId,
    x,
    y: 0,
    z,
    scale: 1,
    rotation: { x: 0, y: 0, z: 0 },
  }
}

describe('scatterBatchesOf', () => {
  it('keeps an empty cell registry empty', () => {
    expect(scatterBatchesOf([])).toEqual([])
  })

  it('opens one batch per asset and world-partition cell, never one per pose', () => {
    const poses = [
      pose('pine', 1, 1),
      pose('pine', 2, 2),
      pose('oak', 3, 3),
      pose('pine', CELL_SIZE + 1, 1),
    ]
    const batches = scatterBatchesOf(poses)
    expect(batches).toHaveLength(3)
    expect(batches.map(batch => `${batch.assetId}:${batch.poses.length}`).sort()).toEqual([
      'oak:1',
      'pine:1',
      'pine:2',
    ])
  })
})

describe('scatterDrawnOf', () => {
  it('draws a batch as one InstancedMesh wrapped in a cell LOD, not one mesh per pose', () => {
    const geometry = new BoxGeometry(1, 1, 1)
    const material = new MeshStandardMaterial()
    const batch = scatterBatchesOf([pose('pine', 0, 0), pose('pine', 1, 0), pose('pine', 2, 0)])[0]
    if (!batch) throw new Error('expected a batch')
    const drawn = scatterDrawnOf(batch, new Mesh(geometry, material))
    expect(drawn).toBeInstanceOf(LOD)
    const mesh = drawn.levels[0]?.object
    expect(mesh).toBeInstanceOf(InstancedMesh)
    expect(mesh instanceof InstancedMesh ? mesh.count : 0).toBe(3)
    expect(drawn.levels).toHaveLength(3)
    expect(drawn.levels[1]?.object).toBeInstanceOf(InstancedMesh)
    expect(
      drawn.levels[1]?.object instanceof InstancedMesh ? drawn.levels[1].object.count : 0,
    ).toBe(1)
    expect(drawn.levels[2]?.object).toBeInstanceOf(Object3D)
    expect(drawn.levels[2]?.object instanceof InstancedMesh).toBe(false)
    expect(drawn.levels.map(level => level.distance)).toEqual([
      0,
      expect.any(Number),
      expect.any(Number),
    ])
    expect(drawn.levels[2]?.distance ?? 0).toBeGreaterThan(drawn.levels[1]?.distance ?? 0)
    expect(drawn.position.toArray()).toEqual([CELL_SIZE / 2, 0, CELL_SIZE / 2])
  })

  it('centres a grass batch on its finer cell grain', () => {
    const batch = scatterBatchesOf(
      [pose('grass', GRASS_CELL_SIZE + 1, 1)],
      () => cellKey(1, 0),
      GRASS_CELL_SIZE,
    )[0]
    if (!batch) throw new Error('expected a batch')
    const drawn = scatterDrawnOf(
      batch,
      new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()),
    )
    expect(drawn.position.toArray()).toEqual([GRASS_CELL_SIZE * 1.5, 0, GRASS_CELL_SIZE / 2])
  })

  it('builds stable nested grass subsets for every configured distance', () => {
    const poses = Array.from({ length: 100 }, (_unused, index) => pose('grass', index, index * 2))
    const first = grassDensityLevels(poses, 17)
    const again = grassDensityLevels(poses, 17)

    expect(first).toEqual(again)
    expect(first).toHaveLength(GRASS_DENSITY_LEVELS.length)
    for (let index = 1; index < first.length; index += 1) {
      const denser = new Set(first[index - 1]?.poses)
      expect(first[index]?.poses.every(candidate => denser.has(candidate))).toBe(true)
    }
  })

  it('switches grass batches at every configured distance threshold', () => {
    const poses = Array.from({ length: 100 }, (_unused, index) => pose('grass', index, index))
    const batch = scatterBatchesOf(poses, undefined, GRASS_CELL_SIZE, 'grass', 17)[0]
    if (!batch) throw new Error('expected a batch')
    const drawn = scatterDrawnOf(
      batch,
      new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()),
    )
    expect(drawn.levels).toHaveLength(GRASS_DENSITY_LEVELS.length)
    expect(drawn.levels.map(level => level.distance)).toEqual(
      GRASS_DENSITY_LEVELS.map(level =>
        expect.closeTo((drawn.levels[1]?.distance ?? 0) * (level.distanceMultiplier / 4), 5),
      ),
    )
  })
})

describe('holdScatterCells', () => {
  it('registers each occupied cell once on the world partition', () => {
    const partition = buildPartition()
    const batches = scatterBatchesOf([
      pose('pine', 1, 1),
      pose('oak', 2, 2),
      pose('pine', CELL_SIZE + 1, 1),
    ])
    holdScatterCells(batches, partition)
    expect(partition.stats().cells).toBe(2)
  })
})
