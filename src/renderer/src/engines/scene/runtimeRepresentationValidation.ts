import type { SceneState } from './sceneState'
import { createRuntimeWorldCompiler, type RuntimeWorld } from './runtimeWorldCompiler'
import {
  validateSafeRuntime,
  type SafeRuntimeSnapshot,
  type SafeRuntimeValidationReport,
} from './safeRuntimeValidation'
import type { VisualFrame, VisualRegressionOptions } from './visualRegression'

export type RuntimeRenderCamera = {
  id: string
  position: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number }
  projection: 'perspective' | 'orthographic'
  fieldOfView?: number
  orthographicSize?: number
  near: number
  far: number
  width: number
  height: number
  cameraMask: number
}

export type RuntimeValidationDriver<
  Representation,
  Snapshot extends SafeRuntimeSnapshot = SafeRuntimeSnapshot,
> = {
  buildOriginal: (world: SceneState) => Promise<Representation>
  buildOptimized: (world: RuntimeWorld) => Promise<Representation>
  render: (representation: Representation, camera: RuntimeRenderCamera) => Promise<VisualFrame>
  observe: (representation: Representation) => Promise<Snapshot>
  dispose: (representation: Representation) => void
}

export type RuntimeRepresentationValidationInput<Representation> = {
  cameras: readonly RuntimeRenderCamera[]
  visualOptions: VisualRegressionOptions
  driver: RuntimeValidationDriver<Representation>
}

export async function validateRuntimeRepresentation<Representation>(
  source: SceneState,
  input: RuntimeRepresentationValidationInput<Representation>,
): Promise<SafeRuntimeValidationReport> {
  assertUniqueCameras(input.cameras)
  const runtime = createRuntimeWorldCompiler().compileRuntimeWorld(source)
  let original: Representation | undefined
  let optimized: Representation | undefined
  try {
    original = await input.driver.buildOriginal(source)
    optimized = await input.driver.buildOptimized(runtime)
    const originalRepresentation = original
    const optimizedRepresentation = optimized
    return await validateSafeRuntime({
      cameras: input.cameras,
      renderOriginal: async camera =>
        await input.driver.render(originalRepresentation, cameraOf(input.cameras, camera.id)),
      renderOptimized: async camera =>
        await input.driver.render(optimizedRepresentation, cameraOf(input.cameras, camera.id)),
      observeOriginal: async () => await input.driver.observe(originalRepresentation),
      observeOptimized: async () => await input.driver.observe(optimizedRepresentation),
      visualOptions: input.visualOptions,
    })
  } finally {
    if (optimized !== undefined) input.driver.dispose(optimized)
    if (original !== undefined) input.driver.dispose(original)
  }
}

function assertUniqueCameras(cameras: readonly RuntimeRenderCamera[]): void {
  const ids = new Set(cameras.map(camera => camera.id))
  if (ids.size !== cameras.length) throw new Error('Runtime validation camera IDs must be unique')
}

function cameraOf(cameras: readonly RuntimeRenderCamera[], id: string): RuntimeRenderCamera {
  const camera = cameras.find(candidate => candidate.id === id)
  if (!camera) throw new Error(`Runtime validation camera is missing: ${id}`)
  return camera
}
