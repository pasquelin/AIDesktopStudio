import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import type { AutoRigResult, AutoRigSkinBinding } from '@shared/domain/autoRig'
import { isFingerRole, isHumanoidRole, type HumanoidRole } from '@shared/domain/humanoid'
import { rigFaultOf } from '@shared/domain/rig'
import type { RigBone } from '@shared/domain/rig'
import type { AutoRigInferencePrimitive } from '@shared/domain/autoRigInference'

const OUTPUT_INFLUENCES = 4

export type MakeItAnimatablePrimitive = AutoRigInferencePrimitive

export type MakeItAnimatableOutput = {
  jointNames: readonly string[]
  parents: Int16Array
  joints: Float32Array
  tails: Float32Array
  weights: Float32Array
  sourceInfluences: number
  modelToInput: Float32Array
  inputToModel: Float32Array
  primitives: readonly MakeItAnimatablePrimitive[]
}

export type MakeItAnimatableFault =
  | 'invalid-hierarchy'
  | 'invalid-joints'
  | 'invalid-weights'
  | 'invalid-transform'
  | 'invalid-primitive-map'
  | 'too-many-bones'

export type MakeItAnimatableAdaptation =
  { result: AutoRigResult; fault: null } | { result: null; fault: MakeItAnimatableFault }

export function adaptMakeItAnimatable(output: MakeItAnimatableOutput): MakeItAnimatableAdaptation {
  const fault = faultOf(output)
  if (fault) return { result: null, fault }

  const bones = bonesOf(output)
  if (rigFaultOf(bones)) return { result: null, fault: 'invalid-hierarchy' }
  const bindings = bindingsOf(output)
  if (!bindings) return { result: null, fault: 'invalid-weights' }

  return {
    fault: null,
    result: {
      rig: { bones, origin: 'local' },
      bindings,
      metadata: {
        backendId: 'make-it-animatable',
        sourceInfluences: output.sourceInfluences,
        outputInfluences: OUTPUT_INFLUENCES,
        fingers: bones.some(bone => bone.role !== undefined && isFingerRole(bone.role)),
      },
    },
  }
}

function faultOf(output: MakeItAnimatableOutput): MakeItAnimatableFault | null {
  const boneCount = output.jointNames.length
  if (boneCount > 65_535) return 'too-many-bones'
  if (boneCount === 0 || output.parents.length !== boneCount) return 'invalid-hierarchy'
  if (output.jointNames.some(name => name.length === 0)) return 'invalid-hierarchy'
  if (new Set(output.jointNames).size !== boneCount) return 'invalid-hierarchy'
  if (
    output.joints.length !== boneCount * 3 ||
    output.tails.length !== boneCount * 3 ||
    !finite(output.joints) ||
    !finite(output.tails)
  )
    return 'invalid-joints'
  if (!validTransforms(output)) return 'invalid-transform'
  if (output.sourceInfluences !== boneCount || output.weights.length % boneCount !== 0) {
    return 'invalid-weights'
  }
  if (!finite(output.weights) || output.weights.some(weight => weight < 0)) return 'invalid-weights'

  for (const [index, parent] of output.parents.entries()) {
    if (parent >= index || parent < -1) return 'invalid-hierarchy'
  }

  const vertices = output.weights.length / boneCount
  if (vertices === 0 || output.primitives.length === 0) return 'invalid-weights'
  return primitiveMapFaultOf(output.primitives, vertices)
}

function primitiveMapFaultOf(
  primitives: readonly MakeItAnimatablePrimitive[],
  vertices: number,
): MakeItAnimatableFault | null {
  const targets = new Set<string>()
  const ranges = new Map<string, { start: number; end: number }>()
  for (const primitive of primitives) {
    if (!validPrimitive(primitive)) return 'invalid-primitive-map'
    const target = `${primitive.mesh}:${primitive.primitive}`
    if (targets.has(target)) return 'invalid-primitive-map'
    targets.add(target)
    const end = primitive.vertexOffset + primitive.vertexCount
    ranges.set(`${primitive.vertexOffset}:${end}`, { start: primitive.vertexOffset, end })
  }
  const unique = [...ranges.values()].sort((one, other) => one.start - other.start)
  let expectedOffset = 0
  for (const range of unique) {
    if (range.start !== expectedOffset) return 'invalid-primitive-map'
    expectedOffset = range.end
  }
  return expectedOffset === vertices ? null : 'invalid-primitive-map'
}

function validPrimitive(primitive: MakeItAnimatablePrimitive): boolean {
  return [primitive.mesh, primitive.primitive, primitive.vertexOffset, primitive.vertexCount].every(
    value => Number.isInteger(value) && value >= 0,
  )
}

function validTransforms(output: MakeItAnimatableOutput): boolean {
  return (
    output.inputToModel.length === 16 &&
    output.modelToInput.length === 16 &&
    finite(output.inputToModel) &&
    finite(output.modelToInput) &&
    inverseTransforms(output.modelToInput, output.inputToModel)
  )
}

function bonesOf(output: MakeItAnimatableOutput): RigBone[] {
  const intoModel = new Matrix4().fromArray(output.inputToModel)
  const globals = output.jointNames.map((_, index) =>
    new Vector3().fromArray(output.joints, index * 3).applyMatrix4(intoModel),
  )
  const tails = output.jointNames.map((_, index) =>
    new Vector3().fromArray(output.tails, index * 3).applyMatrix4(intoModel),
  )
  const orientations = globals.map((head, index) =>
    new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), boneDirection(head, tails[index])),
  )

  return output.jointNames.map((name, index) => {
    const parentIndex = output.parents[index] ?? -1
    const position = globals[index]?.clone() ?? new Vector3()
    const rotation = orientations[index]?.clone() ?? new Quaternion()
    if (parentIndex >= 0) {
      const parentOrientation = orientations[parentIndex]?.clone() ?? new Quaternion()
      position
        .sub(globals[parentIndex] ?? new Vector3())
        .applyQuaternion(parentOrientation.clone().invert())
      rotation.premultiply(parentOrientation.invert())
    }
    const role = roleOf(name)
    const angles = new Euler().setFromQuaternion(rotation)

    return {
      name,
      parent: parentIndex < 0 ? null : (output.jointNames[parentIndex] ?? null),
      rest: {
        position: { x: position.x, y: position.y, z: position.z },
        rotation: { x: angles.x, y: angles.y, z: angles.z },
        scale: { x: 1, y: 1, z: 1 },
      },
      ...(role ? { role } : {}),
    }
  })
}

function boneDirection(head: Vector3, tail: Vector3 | undefined): Vector3 {
  const direction = (tail ?? head).clone().sub(head)
  return direction.lengthSq() > 1e-12 ? direction.normalize() : new Vector3(0, 1, 0)
}

function bindingsOf(output: MakeItAnimatableOutput): AutoRigSkinBinding[] | null {
  const reduced = dominantFour(output.weights, output.sourceInfluences)
  if (!reduced) return null

  return output.primitives.map(primitive => {
    const first = primitive.vertexOffset * OUTPUT_INFLUENCES
    const last = first + primitive.vertexCount * OUTPUT_INFLUENCES
    return {
      mesh: primitive.mesh,
      primitive: primitive.primitive,
      skinIndex: reduced.skinIndex.slice(first, last),
      skinWeight: reduced.skinWeight.slice(first, last),
    }
  })
}

export function dominantFour(
  weights: Float32Array,
  influences: number,
): { skinIndex: Uint16Array; skinWeight: Float32Array } | null {
  if (influences <= 0 || weights.length % influences !== 0) return null
  const vertices = weights.length / influences
  const skinIndex = new Uint16Array(vertices * OUTPUT_INFLUENCES)
  const skinWeight = new Float32Array(vertices * OUTPUT_INFLUENCES)
  for (let vertex = 0; vertex < vertices; vertex += 1) {
    const strongest = strongestFour(weights, vertex * influences, influences)
    if (!strongest) return null
    for (let slot = 0; slot < OUTPUT_INFLUENCES; slot += 1) {
      skinIndex[vertex * OUTPUT_INFLUENCES + slot] = strongest.indices[slot] ?? 0
      skinWeight[vertex * OUTPUT_INFLUENCES + slot] =
        Math.max(0, strongest.weights[slot] ?? 0) / strongest.total
    }
  }

  return { skinIndex, skinWeight }
}

function strongestFour(
  values: Float32Array,
  offset: number,
  influences: number,
): { indices: Uint16Array; weights: Float64Array; total: number } | null {
  const indices = new Uint16Array(OUTPUT_INFLUENCES)
  const weights = new Float64Array(OUTPUT_INFLUENCES).fill(-1)
  for (let index = 0; index < influences; index += 1) {
    const weight = values[offset + index]
    if (weight === undefined || !Number.isFinite(weight) || weight < 0) return null
    let slot = 0
    while (slot < OUTPUT_INFLUENCES && weight <= (weights[slot] ?? -1)) slot += 1
    if (slot === OUTPUT_INFLUENCES) continue
    weights.copyWithin(slot + 1, slot, OUTPUT_INFLUENCES - 1)
    indices.copyWithin(slot + 1, slot, OUTPUT_INFLUENCES - 1)
    weights[slot] = weight
    indices[slot] = index
  }
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0)
  return total > 0 && Number.isFinite(total) ? { indices, weights, total } : null
}

function finite(values: Float32Array): boolean {
  return values.every(Number.isFinite)
}

function inverseTransforms(modelToInput: Float32Array, inputToModel: Float32Array): boolean {
  const product = new Matrix4()
    .fromArray(modelToInput)
    .multiply(new Matrix4().fromArray(inputToModel))
  const identity = new Matrix4().elements
  return product.elements.every((value, index) => Math.abs(value - (identity[index] ?? 0)) < 1e-5)
}

function roleOf(name: string): HumanoidRole | undefined {
  const body: Record<string, HumanoidRole> = {
    Hips: 'Hips',
    Spine: 'Spine',
    Spine1: 'Chest',
    Spine2: 'UpperChest',
    Neck: 'Neck',
    Head: 'Head',
    LeftShoulder: 'LeftShoulder',
    LeftArm: 'LeftUpperArm',
    LeftForeArm: 'LeftLowerArm',
    LeftHand: 'LeftHand',
    RightShoulder: 'RightShoulder',
    RightArm: 'RightUpperArm',
    RightForeArm: 'RightLowerArm',
    RightHand: 'RightHand',
    LeftUpLeg: 'LeftUpperLeg',
    LeftLeg: 'LeftLowerLeg',
    LeftFoot: 'LeftFoot',
    LeftToeBase: 'LeftToes',
    RightUpLeg: 'RightUpperLeg',
    RightLeg: 'RightLowerLeg',
    RightFoot: 'RightFoot',
    RightToeBase: 'RightToes',
  }
  if (body[name]) return body[name]

  const finger = /^(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)([123])$/.exec(name)
  if (!finger) return undefined
  const side = finger[1]
  const kind = finger[2] === 'Pinky' ? 'Little' : finger[2]
  const role = `${side}${kind}${finger[3]}`
  return isHumanoidRole(role) ? role : undefined
}
