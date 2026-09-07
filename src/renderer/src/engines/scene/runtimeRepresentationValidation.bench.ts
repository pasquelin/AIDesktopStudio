import { bench } from '@shared/vitestBench'
import { describe } from 'vitest'
import { worldBenchmarkScenes } from './worldBenchmarkScenes.fixture'
import { sceneRuntimeSnapshot } from './sceneRuntimeSnapshot'
import {
  validateRuntimeRepresentation,
  type RuntimeRenderCamera,
} from './runtimeRepresentationValidation'

const small = worldBenchmarkScenes().find(scene => scene.id === 'S1')
const camera: RuntimeRenderCamera = {
  id: 'benchmark',
  position: { x: 0, y: 10, z: 20 },
  target: { x: 0, y: 0, z: 0 },
  projection: 'perspective',
  fieldOfView: 50,
  near: 0.1,
  far: 100,
  width: 64,
  height: 64,
  cameraMask: 1,
}

if (small) {
  describe('S1 runtime validation orchestration overhead', () => {
    bench('compiles and compares one camera without renderer cost', async () => {
      await validateRuntimeRepresentation(small.state, {
        cameras: [camera],
        visualOptions: { channelTolerance: 0, maximumChangedPixelRatio: 0 },
        driver: {
          buildOriginal: async world => world,
          buildOptimized: async world => world,
          render: async () => ({
            width: 1,
            height: 1,
            pixels: new Uint8Array([0, 0, 0, 255]),
          }),
          observe: async world => sceneRuntimeSnapshot(world),
          dispose: () => {},
        },
      })
    })
  })
}
