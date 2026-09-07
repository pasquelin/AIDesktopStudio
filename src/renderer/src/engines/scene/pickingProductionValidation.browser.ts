import { stableKey } from '@shared/hash'
import { compareVisualFrames } from './visualRegression'
import { createRuntimeWorldCompiler } from './runtimeWorldCompiler'
import { createSceneRuntimeValidationDriver } from './sceneRuntimeValidationDriver'
import { worldBenchmarkScenes } from './worldBenchmarkScenes.fixture'
import { benchmarkModel, benchmarkTexture, camerasFor } from './worldBenchmarkBrowserFixtures'

type PickingProductionValidationResult = {
  equivalent: boolean
  renderedFrames: number
  observedPickSamples: number
  pickingEquivalent: boolean
  changedPixelRatios: readonly number[]
  maximumChannelDifferences: readonly number[]
  durationMs: number
}

async function validateProductionPicking(): Promise<PickingProductionValidationResult> {
  const benchmark = worldBenchmarkScenes().find(scene => scene.id === 'S5')
  if (!benchmark) throw new Error('S5 picking benchmark is absent')

  const cameras = camerasFor(benchmark.state)
  const driver = createSceneRuntimeValidationDriver({
    cameras,
    renderer: {
      loadModel: async () => benchmarkModel(),
      loadTexture: async () => benchmarkTexture(),
    },
  })
  const started = performance.now()
  const original = await driver.buildOriginal(benchmark.state)
  const optimized = await driver.buildOptimized(
    createRuntimeWorldCompiler().compileRuntimeWorld(benchmark.state),
  )

  try {
    const visual = []
    for (const camera of cameras) {
      visual.push(
        compareVisualFrames(
          await driver.render(original, camera),
          await driver.render(optimized, camera),
          {
            channelTolerance: 1,
            maximumChangedPixelRatio: 0.002,
          },
        ),
      )
    }
    const before = original.engine.runtimeValidationSnapshot()
    const after = optimized.engine.runtimeValidationSnapshot()
    const pickingEquivalent = stableKey(before.picking) === stableKey(after.picking)
    const result = {
      equivalent: visual.every(result => result.equivalent) && pickingEquivalent,
      renderedFrames: visual.length * 2,
      observedPickSamples: after.picking.rendered.reduce(
        (count, [, picks]) => count + picks.length,
        0,
      ),
      pickingEquivalent,
      changedPixelRatios: visual.map(result => result.changedPixelRatio),
      maximumChannelDifferences: visual.map(result => result.maximumChannelDifference),
      durationMs: performance.now() - started,
    }
    return verified(result)
  } finally {
    driver.dispose(optimized)
    driver.dispose(original)
  }
}

function verified(result: PickingProductionValidationResult): PickingProductionValidationResult {
  if (!result.equivalent || result.observedPickSamples === 0) {
    throw new Error(`production picking validation failed: ${JSON.stringify(result)}`)
  }
  return result
}

Reflect.set(window, '__iaValidateProductionPicking', validateProductionPicking)
