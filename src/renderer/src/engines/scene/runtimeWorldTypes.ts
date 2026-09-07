import type { RuntimeRenderArtifact } from './grouping'
import type { SceneState } from './sceneState'

export type RuntimeOptimization = {
  readonly artifacts: readonly RuntimeRenderArtifact[]
}

export type RuntimeWorld = SceneState & {
  readonly runtimeOptimization: RuntimeOptimization
}
