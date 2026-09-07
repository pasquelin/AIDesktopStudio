import { stableKey } from '@shared/hash'
import {
  compareVisualFrames,
  type VisualFrame,
  type VisualRegressionOptions,
  type VisualRegressionResult,
} from './visualRegression'

export type SafeFunctionalCheck =
  | 'picking'
  | 'animation'
  | 'timeline'
  | 'scripts'
  | 'physics'
  | 'shadows'
  | 'cameras'
  | 'visibility'
  | 'postProcessing'
  | 'transforms'
  | 'duplication'
  | 'undoRedo'

export const SAFE_FUNCTIONAL_CHECKS: readonly SafeFunctionalCheck[] = [
  'picking',
  'animation',
  'timeline',
  'scripts',
  'physics',
  'shadows',
  'cameras',
  'visibility',
  'postProcessing',
  'transforms',
  'duplication',
  'undoRedo',
]

/**
 * Every check answered, once. What sits BEHIND a check is the producer's own type, declared by the
 * producer and carried through `RuntimeValidationDriver` — both sides of a comparison come from
 * the same producer, and `stableKey` asks nothing more than that it serialise.
 */
export type SafeRuntimeSnapshot = Record<SafeFunctionalCheck, unknown>
export type SafeValidationCamera = { id: string }
export type SafeFunctionalResult = { check: SafeFunctionalCheck; equivalent: boolean }
export type SafeVisualResult = VisualRegressionResult & { cameraId: string }
export type SafeRuntimeValidationReport = {
  visual: readonly SafeVisualResult[]
  functional: readonly SafeFunctionalResult[]
  /** Frames actually captured, so a recipe counting them never restates how many are taken. */
  renderedFrames: number
  equivalent: boolean
}

export type SafeRuntimeValidationInput = {
  cameras: readonly SafeValidationCamera[]
  renderOriginal: (camera: SafeValidationCamera) => Promise<VisualFrame>
  renderOptimized: (camera: SafeValidationCamera) => Promise<VisualFrame>
  observeOriginal: () => Promise<SafeRuntimeSnapshot>
  observeOptimized: () => Promise<SafeRuntimeSnapshot>
  visualOptions: VisualRegressionOptions
}

export async function validateSafeRuntime(
  input: SafeRuntimeValidationInput,
): Promise<SafeRuntimeValidationReport> {
  if (input.cameras.length === 0) throw new Error('SAFE validation requires at least one camera')
  const visual: SafeVisualResult[] = []
  let renderedFrames = 0
  for (const camera of input.cameras) {
    visual.push({
      cameraId: camera.id,
      ...compareVisualFrames(
        await input.renderOriginal(camera),
        await input.renderOptimized(camera),
        input.visualOptions,
      ),
    })
    renderedFrames += 2
  }

  const original = await input.observeOriginal()
  const optimized = await input.observeOptimized()
  const functional = SAFE_FUNCTIONAL_CHECKS.map(check => ({
    check,
    equivalent: stableKey(original[check]) === stableKey(optimized[check]),
  }))
  return {
    visual,
    functional,
    renderedFrames,
    equivalent:
      visual.every(result => result.equivalent) && functional.every(result => result.equivalent),
  }
}
