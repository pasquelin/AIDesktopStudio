import { bench } from '@shared/vitestBench'
import { describe } from 'vitest'
import { NO_LOSSY_OPTIMIZATION } from '@shared/domain/gameExport'
import { meshNode } from './scene-fixtures'
import { compileLossyWorld } from './lossyWorldCompiler'
import type { SceneState } from './sceneState'
import { analyzeLossyWorld } from './worldAnalyzer'

function scene(count: number): Pick<SceneState, 'nodes'> {
  return {
    nodes: Array.from({ length: count }, (_unused, index) => ({
      ...meshNode(`sphere-${index}`),
      geometry: { kind: 'sphere', radius: 1, widthSegments: 64, heightSegments: 32 },
    })),
  }
}

describe('compiling explicit lossy runtime descriptors', () => {
  for (const count of [50, 10_000]) {
    const source = scene(count)
    const plan = analyzeLossyWorld(source.nodes)
    bench(`${count} repeated spheres`, () => {
      compileLossyWorld(
        source,
        {
          ...NO_LOSSY_OPTIMIZATION,
          generateLods: true,
          geometrySimplification: 'balanced',
        },
        plan,
      )
    })
  }
})
