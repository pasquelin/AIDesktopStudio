import { rigFaultOf, type Rig } from './rig'

export type AutoRigTarget = 'humanoid' | 'generic'

export type AutoRigCapabilities = {
  target: AutoRigTarget
  skeleton: boolean
  skinWeights: boolean
  fingers: boolean
  local: boolean
}

/**
 * The Auto Rig backends the studio implements. A closed union rather than a string: a catalogue
 * entry naming a `backendId` nothing here runs was offered in the service field and answered
 * `Unknown Auto Rig backend`, shown to the reader as « le squelettage avancé n'a pas pu terminer ».
 */
export type AutoRigBackendId = 'simple' | 'make-it-animatable'

/** The values beside the union — what the offer filters the catalogue against. */
export const AUTO_RIG_BACKEND_IDS: readonly AutoRigBackendId[] = ['simple', 'make-it-animatable']

/** A `backendId` off a model manifest, which is a plain string there — motion uses one too. */
export function isAutoRigBackendId(value: unknown): value is AutoRigBackendId {
  return AUTO_RIG_BACKEND_IDS.some(candidate => candidate === value)
}

export type AutoRigBackendDescriptor = {
  id: AutoRigBackendId
  requiresModel: boolean
  modelIds: readonly string[]
  devices: readonly AutoRigDevice[]
  experimental: boolean
  capabilities: AutoRigCapabilities
  platformSupport?: readonly AutoRigPlatformSupport[]
}

export type AutoRigDevice = 'cpu' | 'mps'
export type AutoRigAvailability = 'available' | 'unavailable' | 'untested' | 'unsupported'
export type AutoRigPlatform = 'darwin' | 'linux' | 'win32'
export type AutoRigArchitecture = 'arm64' | 'x64'
export type AutoRigPlatformSupport = {
  platform: AutoRigPlatform
  architecture: AutoRigArchitecture
  status: AutoRigAvailability
}

export function autoRigAvailabilityOf(
  backend: AutoRigBackendDescriptor,
  platform: AutoRigPlatform,
  architecture: AutoRigArchitecture,
): AutoRigAvailability {
  if (!backend.platformSupport) return 'available'
  return (
    backend.platformSupport.find(
      target => target.platform === platform && target.architecture === architecture,
    )?.status ?? 'untested'
  )
}

/** One original glTF primitive's four influences, kept separate across backend boundaries. */
export type AutoRigSkinBinding = {
  mesh: number
  primitive: number
  skinIndex: Uint16Array
  skinWeight: Float32Array
}

export type AutoRigPrimitiveTarget = {
  mesh: number
  primitive: number
  vertexCount: number
}

/** The only representation a backend hands to the studio rig runtime. */
export type AutoRigResult = {
  rig: Rig
  bindings: readonly AutoRigSkinBinding[]
  metadata: {
    backendId: string
    sourceInfluences: number
    outputInfluences: number
    fingers: boolean
  }
}

export type AutoRigResultFault =
  | 'invalid-rig'
  | 'invalid-metadata'
  | 'invalid-binding-target'
  | 'duplicate-binding-target'
  | 'invalid-binding-size'
  | 'invalid-joint-index'
  | 'invalid-weight'

export function autoRigResultFaultOf(
  result: AutoRigResult,
  expectedTargets: readonly AutoRigPrimitiveTarget[],
): AutoRigResultFault | null {
  if (rigFaultOf(result.rig.bones)) return 'invalid-rig'
  if (
    result.metadata.outputInfluences !== 4 ||
    result.metadata.sourceInfluences < result.metadata.outputInfluences ||
    result.metadata.backendId.length === 0
  )
    return 'invalid-metadata'
  if (result.bindings.length === 0) return 'invalid-binding-size'
  const expected = new Map(
    expectedTargets.map(target => [`${target.mesh}:${target.primitive}`, target.vertexCount]),
  )
  if (expected.size !== expectedTargets.length) return 'duplicate-binding-target'
  const targets = new Set<string>()
  for (const binding of result.bindings) {
    const target = `${binding.mesh}:${binding.primitive}`
    const vertexCount = expected.get(target)
    const bindingFault = autoRigBindingFaultOf(binding, vertexCount, result.rig.bones.length)
    if (bindingFault) return bindingFault
    if (targets.has(target)) return 'duplicate-binding-target'
    targets.add(target)
  }
  return targets.size === expected.size ? null : 'invalid-binding-target'
}

export function autoRigBindingFaultOf(
  binding: AutoRigSkinBinding,
  vertexCount: number | undefined,
  boneCount: number,
): AutoRigResultFault | null {
  if (!Number.isInteger(binding.mesh) || binding.mesh < 0) return 'invalid-binding-target'
  if (!Number.isInteger(binding.primitive) || binding.primitive < 0 || vertexCount === undefined) {
    return 'invalid-binding-target'
  }
  if (
    binding.skinIndex.length === 0 ||
    binding.skinIndex.length !== binding.skinWeight.length ||
    binding.skinIndex.length !== vertexCount * 4
  )
    return 'invalid-binding-size'
  for (let vertex = 0; vertex < binding.skinWeight.length; vertex += 4) {
    let sum = 0
    for (let influence = 0; influence < 4; influence += 1) {
      const offset = vertex + influence
      if ((binding.skinIndex[offset] ?? boneCount) >= boneCount) return 'invalid-joint-index'
      const weight = binding.skinWeight[offset]
      if (weight === undefined || !Number.isFinite(weight) || weight < 0) return 'invalid-weight'
      sum += weight
    }
    if (Math.abs(1 - sum) > 1e-5) return 'invalid-weight'
  }
  return null
}
