import { bench } from '@shared/vitestBench'
import { describe } from 'vitest'
import type { GeometryDescriptor } from '@shared/domain/scene'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import type { AssetPort } from '@game/ports/assetPort'
import { meshNode } from '@/engines/scene/nodeFactory'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { buildGameScene } from './gameScene'

const NOTHING: AssetPort = { urlOf: () => null }
const BOX: GeometryDescriptor = { kind: 'box', width: 1, height: 1, depth: 1 }
const state = {
  ...EMPTY_SCENE,
  nodes: Array.from({ length: 10_000 }, (_unused, index) => ({
    ...meshNode(BOX, { name: `Crate ${index}` }),
    transform: {
      ...IDENTITY_TRANSFORM,
      position: { x: index % 100, y: 0, z: Math.floor(index / 100) },
    },
  })),
}

// The WHOLE build, grouping included — ten thousand meshes and materials are allocated inside the
// measure, and they dominate it. `buildGameScene` hands back nothing narrower to time, so the name
// says what the number holds rather than promising the grouping alone.
describe('an exported game with 10,000 repeated objects', () => {
  bench('builds it whole, grouping and disposal included', async () => {
    const built = await buildGameScene(state, NOTHING)
    built.dispose()
  })
})
