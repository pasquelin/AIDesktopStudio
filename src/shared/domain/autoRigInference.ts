import { isFingerRole } from './humanoid'
import type { RigBone } from './rig'

export type AutoRigInferencePrimitive = {
  mesh: number
  primitive: number
  vertexOffset: number
  vertexCount: number
}

export type AutoRigInferenceOptions = {
  /** Keep the predicted finger chains, or merge their skinning into the hands. */
  fingers: 'detailed' | 'simplified'
  /** Use MIA's dedicated normal-aware weight network for close or touching limbs. */
  useSurfaceNormals: boolean
  /** Remove mutually exclusive influences and retain the four strongest weights. */
  weightPostProcessing: boolean
}

export const DEFAULT_AUTO_RIG_OPTIONS: AutoRigInferenceOptions = {
  fingers: 'simplified',
  useSurfaceNormals: false,
  weightPostProcessing: true,
}

/**
 * The settings that would rebuild the rig already in place, so regenerating one with untouched
 * settings does not silently drop the thirty finger bones the first pass had asked for.
 */
export function autoRigOptionsOf(bones: readonly RigBone[] | undefined): AutoRigInferenceOptions {
  const detailed = bones?.some(bone => bone.role !== undefined && isFingerRole(bone.role))
  return detailed ? { ...DEFAULT_AUTO_RIG_OPTIONS, fingers: 'detailed' } : DEFAULT_AUTO_RIG_OPTIONS
}

export type AutoRigInferenceRequest = {
  id: string
  backendId: string
  positions: Float32Array
  triangles: Uint32Array
  primitives: readonly AutoRigInferencePrimitive[]
  options: AutoRigInferenceOptions
}

export type AutoRigInferenceResult = {
  jointNames: readonly string[]
  parents: Int16Array
  joints: Float32Array
  tails: Float32Array
  weights: Float32Array
  sourceInfluences: number
  modelToInput: Float32Array
  inputToModel: Float32Array
  primitives: readonly AutoRigInferencePrimitive[]
  device: string
  loadMs: number | null
  inferenceMs: number | null
  peakRssBytes: number | null
}

export type AutoRigProgressPhase =
  'prepare' | 'load' | 'analyse' | 'skeleton' | 'pose' | 'skinning' | 'apply'

export const AUTO_RIG_PROGRESS_PHASES: readonly AutoRigProgressPhase[] = [
  'prepare',
  'load',
  'analyse',
  'skeleton',
  'pose',
  'skinning',
  'apply',
]

export type AutoRigProductError =
  | 'MODEL_NOT_INSTALLED'
  | 'MODEL_INVALID'
  | 'ENGINE_UNAVAILABLE'
  | 'UNSUPPORTED_PLATFORM'
  | 'INVALID_MESH'
  | 'NOT_HUMANOID'
  | 'INFERENCE_FAILED'
  | 'OUT_OF_MEMORY'
  | 'CANCELLED'

export const AUTO_RIG_PRODUCT_ERRORS: readonly AutoRigProductError[] = [
  'MODEL_NOT_INSTALLED',
  'MODEL_INVALID',
  'ENGINE_UNAVAILABLE',
  'UNSUPPORTED_PLATFORM',
  'INVALID_MESH',
  'NOT_HUMANOID',
  'INFERENCE_FAILED',
  'OUT_OF_MEMORY',
  'CANCELLED',
]
