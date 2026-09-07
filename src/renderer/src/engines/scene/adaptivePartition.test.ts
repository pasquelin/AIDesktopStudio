import { describe, expect, it } from 'vitest'
import { DEFAULT_OPTIMIZATION_POLICY } from '@shared/domain/optimizationPolicy'
import { meshNode } from './scene-fixtures'
import type { MeshNode } from './sceneState'
import {
  adaptiveCellOf,
  adaptiveCellsOf,
  adaptiveCellSize,
  spatialDiameterOf,
} from './adaptivePartition'

function at(id: string, x: number, z: number): MeshNode {
  const node = meshNode(id)
  return {
    ...node,
    transform: { ...node.transform, position: { x, y: 0, z } },
  }
}

describe('adaptive spatial partition', () => {
  it('uses finer cells for a dense world than for a sparse one', () => {
    const dense = Array.from({ length: 1_024 }, (_unused, index) =>
      at(`dense-${index}`, index % 32, Math.floor(index / 32)),
    )
    const sparse = Array.from({ length: 4 }, (_unused, index) =>
      at(`sparse-${index}`, index * 256, index * 256),
    )

    expect(adaptiveCellSize(dense, DEFAULT_OPTIMIZATION_POLICY)).toBe(32)
    expect(adaptiveCellSize(sparse, DEFAULT_OPTIMIZATION_POLICY)).toBe(64)
  })

  it('keeps dense subdivision local to its anchored root', () => {
    const dense = Array.from({ length: 1_024 }, (_unused, index) =>
      at(`dense-${index}`, index % 32, Math.floor(index / 32)),
    )
    const sparse = at('sparse', 512, 512)

    const cells = adaptiveCellsOf([...dense, sparse], DEFAULT_OPTIMIZATION_POLICY)

    expect(cells.find(cell => cell.nodes.some(node => node.id === sparse.id))?.cell.size).toBe(64)
    expect(
      cells
        .filter(cell => cell.nodes.some(node => node.id.startsWith('dense-')))
        .every(cell => cell.cell.size === 32),
    ).toBe(true)
  })

  it('accounts for geometry cost when choosing culling granularity', () => {
    const box = at('box', 0, 0)
    const sphere: MeshNode = {
      ...at('sphere', 0, 0),
      geometry: { kind: 'sphere', radius: 1, widthSegments: 64, heightSegments: 64 },
    }

    expect(adaptiveCellSize([sphere], DEFAULT_OPTIMIZATION_POLICY)).toBeLessThan(
      adaptiveCellSize([box], DEFAULT_OPTIMIZATION_POLICY),
    )
  })

  it('keeps geometry larger than the maximum batch bounds individual', () => {
    const wide: MeshNode = {
      ...at('wide', 0, 0),
      geometry: { kind: 'box', width: 300, height: 1, depth: 1 },
    }

    expect(spatialDiameterOf(wide)).toBeGreaterThan(DEFAULT_OPTIMIZATION_POLICY.maxBatchBounds)
    const size = adaptiveCellSize([wide], DEFAULT_OPTIMIZATION_POLICY)
    expect(adaptiveCellOf(wide, size, DEFAULT_OPTIMIZATION_POLICY)).toBeNull()
  })

  it('includes Bezier handles when bounding a ribbon', () => {
    const ribbon: MeshNode = {
      ...at('ribbon', 0, 0),
      geometry: {
        kind: 'ribbon',
        width: 1,
        height: 1,
        segments: 8,
        path: {
          kind: 'bezier',
          closed: false,
          points: [
            { x: 0, y: 0, z: 0 },
            { x: 1, y: 0, z: 0 },
          ],
          handles: [
            { in: { x: 0, y: 0, z: 0 }, out: { x: 300, y: 0, z: 0 } },
            { in: { x: 0, y: 0, z: 0 }, out: { x: 0, y: 0, z: 0 } },
          ],
        },
      },
    }

    expect(spatialDiameterOf(ribbon)).toBeGreaterThan(300)
  })

  it('returns the same anchored cell independently of input order', () => {
    const base = at('first', 40, -40)
    const first = {
      ...base,
      transform: { ...base.transform, position: { x: 40, y: 200, z: -40 } },
    }
    const second = at('second', 80, -80)

    const forwardSize = adaptiveCellSize([first, second], DEFAULT_OPTIMIZATION_POLICY)
    const reverseSize = adaptiveCellSize([second, first], DEFAULT_OPTIMIZATION_POLICY)
    expect(adaptiveCellOf(first, forwardSize, DEFAULT_OPTIMIZATION_POLICY)).toEqual(
      adaptiveCellOf(first, reverseSize, DEFAULT_OPTIMIZATION_POLICY),
    )
    expect(adaptiveCellOf(first, forwardSize, DEFAULT_OPTIMIZATION_POLICY)?.y).not.toBe(0)
  })

  it('bounds a cell diagonal plus member radii below the batch limit', () => {
    const size = adaptiveCellSize([], DEFAULT_OPTIMIZATION_POLICY)

    expect(Math.hypot(size * 2, size * 2, size * 2)).toBeLessThanOrEqual(
      DEFAULT_OPTIMIZATION_POLICY.maxBatchBounds,
    )
  })

  it('normalizes invalid spatial policy sizes', () => {
    const invalid = {
      ...DEFAULT_OPTIMIZATION_POLICY,
      maxBatchBounds: 0,
      spatialCellTargetSize: 0,
      spatialCellMinSize: 0,
      spatialCellTargetObjects: 0,
    }

    expect(adaptiveCellSize([], invalid)).toBe(1)
  })
})
