import { describe, expect, it } from 'vitest'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { meshNode } from '@/engines/scene/nodeFactory'
import { gameOptimizationEstimate } from './gameExportCompiler'

describe('gameOptimizationEstimate', () => {
  it('includes every exported scene when no viewport engine is mounted', () => {
    const boxes = Array.from({ length: 16 }, (_, index) => ({
      ...meshNode({ kind: 'box', width: 1, height: 1, depth: 1 }),
      id: `box-${index}`,
    }))
    const sphere = {
      ...meshNode({ kind: 'sphere', radius: 1, widthSegments: 8, heightSegments: 4 }),
      id: 'sphere',
    }

    const estimate = gameOptimizationEstimate([
      { state: { ...EMPTY_SCENE, nodes: boxes } },
      { state: { ...EMPTY_SCENE, nodes: [sphere] } },
    ])

    expect(estimate).toMatchObject({
      scenes: 2,
      objects: 17,
      drawCallsBefore: 17,
      drawCallsAfter: 2,
    })
  })
})
