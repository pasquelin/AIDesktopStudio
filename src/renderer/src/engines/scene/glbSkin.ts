import { Euler, Matrix4, Quaternion } from 'three'
import { glbChunksOf, glbFrom, glbJson } from '@shared/domain/glbContainer'
import { isRecord } from '@shared/guards'
import { STUDIO_METADATA_KEY } from '@shared/domain/studioMetadata'
import type { CharacterExtras } from '@shared/domain/character'
import type { RigBone } from '@shared/domain/rig'
import { bonesOfRig } from '../character/rigBuild'

/** One primitive of the file, and the two attributes that make it skinned. */
export type GlbSkinAttributes = {
  mesh: number
  primitive: number
  /** Four joint indices per vertex, indexing `patch.bones` in order. */
  joints: Uint16Array
  weights: Float32Array
}

export type GlbSkinPatch = {
  bones: readonly RigBone[]
  skins: readonly GlbSkinAttributes[]
  extras: CharacterExtras
}

/** Why the file cannot take this skeleton, or nothing. Asked BEFORE a byte is written. */
export type GlbSkinFault = 'not-glb' | 'no-buffer' | 'unknown-primitive' | 'compressed-primitive'

const COMPRESSIONS = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression']

/** The mark every node this studio wrote carries, so a second save replaces rather than adds. */
const OURS = { [STUDIO_METADATA_KEY]: { bone: true } }

type SkinWorkspace = {
  chunks: NonNullable<ReturnType<typeof glbChunksOf>>
  gltf: Record<string, unknown>
  held: unknown[]
  ourSkins: Set<number>
  nodes: Record<string, unknown>[]
  scenes: Record<string, unknown>[]
  meshes: Record<string, unknown>[]
  accessors: unknown[]
  views: unknown[]
  appended: Uint8Array[]
  length: number
}

export function glbSkinFaultOf(file: Uint8Array, patch: GlbSkinPatch): GlbSkinFault | null {
  const chunks = glbChunksOf(file)
  if (!chunks) return 'not-glb'

  const gltf: unknown = glbJson(chunks.json)
  if (!isRecord(gltf)) return 'not-glb'
  if (
    (patch.bones.length > 0 || patch.skins.length > 0) &&
    (!Array.isArray(gltf.buffers) || gltf.buffers.length === 0)
  )
    return 'no-buffer'

  const meshes = Array.isArray(gltf.meshes) ? gltf.meshes : []
  for (const skin of patch.skins) {
    const primitive = primitiveAt(meshes, skin)
    if (!primitive) return 'unknown-primitive'

    // Nothing can be appended to an attribute the file keeps compressed — the geometry would have
    // to be decoded and written back, which is not what this pass promises.
    const extensions = isRecord(primitive.extensions) ? primitive.extensions : {}
    if (COMPRESSIONS.some(one => one in extensions)) return 'compressed-primitive'
  }

  return null
}

/**
 * The same file with this skeleton in it — every other byte copied, IMAGES INCLUDED.
 *
 * 🛑 Not `GLTFExporter`: it redraws every picture through a canvas and re-encodes it, so a save
 * would cost the character the sharpness of its maps. Here the container is patched in place.
 */
export function glbWithSkin(file: Uint8Array, patch: GlbSkinPatch): Uint8Array {
  if (patch.bones.length === 0 && patch.skins.length === 0) return glbWithExtras(file, patch.extras)

  return glbWithRig(file, patch)
}

function glbWithRig(file: Uint8Array, patch: GlbSkinPatch): Uint8Array {
  const work = skinWorkspace(file)
  if (!work) return file
  const push = (bytes: Uint8Array, stride: number): number => appendView(work, bytes, stride)
  const first = work.nodes.length
  for (const [index, bone] of patch.bones.entries()) {
    work.nodes.push({
      name: bone.name,
      ...placement(bone),
      ...childrenOf(patch.bones, index, first),
      extras: OURS,
    })
  }

  const joints = patch.bones.map((_, index) => first + index)
  const inverses = new Float32Array(bindInversesOf(patch.bones))
  const skin = { joints, inverseBindMatrices: accessorFor(work.accessors, push, inverses) }

  for (const attributes of patch.skins) {
    const primitive = primitiveAt(work.meshes, attributes)
    if (!primitive) continue

    primitive.attributes = {
      ...(isRecord(primitive.attributes) ? primitive.attributes : {}),
      JOINTS_0: unsignedAccessor(work.accessors, push, attributes.joints),
      WEIGHTS_0: accessorFor(work.accessors, push, attributes.weights, 'VEC4'),
    }
  }

  const skins = [...work.held.filter((_, index) => !work.ourSkins.has(index)), skin]
  const wearing = new Set(patch.skins.map(one => one.mesh))
  const dressed = work.nodes.map(node =>
    isRecord(node) && typeof node.mesh === 'number' && wearing.has(node.mesh)
      ? { ...node, skin: skins.length - 1 }
      : node,
  )

  const roots = patch.bones.flatMap((bone, index) => (bone.parent === null ? [first + index] : []))
  const shown = typeof work.gltf.scene === 'number' ? work.gltf.scene : 0
  const withRoots = work.scenes.map((one, index) =>
    index === shown
      ? {
          ...one,
          nodes: [...(Array.isArray(one.nodes) ? one.nodes : []), ...roots],
          extras: { ...ownExtras(one), [STUDIO_METADATA_KEY]: patch.extras },
        }
      : one,
  )

  const written = {
    ...work.gltf,
    nodes: dressed,
    scenes: withRoots,
    meshes: work.meshes,
    accessors: work.accessors,
    bufferViews: work.views,
    skins,
    buffers: [{ ...firstBuffer(work.gltf.buffers), byteLength: work.length }],
  }

  return glbFrom({
    json: new TextEncoder().encode(JSON.stringify(written)),
    bin: joined(work.chunks.bin, work.appended, work.length),
  })
}

/** The same container with only the studio scene extras changed; every binary byte is retained. */
function glbWithExtras(file: Uint8Array, extras: CharacterExtras): Uint8Array {
  const chunks = glbChunksOf(file)
  const gltf: unknown = chunks && glbJson(chunks.json)
  if (!chunks || !isRecord(gltf)) return file

  const shown = typeof gltf.scene === 'number' ? gltf.scene : 0
  const scenes = Array.isArray(gltf.scenes)
    ? gltf.scenes.map((scene, index) =>
        index === shown && isRecord(scene)
          ? { ...scene, extras: { ...ownExtras(scene), [STUDIO_METADATA_KEY]: extras } }
          : scene,
      )
    : []

  return glbFrom({
    json: new TextEncoder().encode(JSON.stringify({ ...gltf, scenes })),
    bin: chunks.bin,
  })
}

function skinWorkspace(file: Uint8Array): SkinWorkspace | null {
  const chunks = glbChunksOf(file)
  const gltf: unknown = chunks && glbJson(chunks.json)
  if (!chunks || !isRecord(gltf)) return null
  const held = Array.isArray(gltf.skins) ? gltf.skins : []
  const ourSkins = new Set(
    held.flatMap((skin, index) => (isOurSkin(gltf.nodes, skin) ? [index] : [])),
  )
  return {
    chunks,
    gltf,
    held,
    ourSkins,
    nodes: withoutOurs(Array.isArray(gltf.nodes) ? gltf.nodes : [], ourSkins),
    scenes: Array.isArray(gltf.scenes)
      ? gltf.scenes.map(one => (isRecord(one) ? { ...one } : {}))
      : [],
    meshes: Array.isArray(gltf.meshes) ? gltf.meshes.map(cloneMesh) : [],
    accessors: Array.isArray(gltf.accessors) ? [...gltf.accessors] : [],
    views: Array.isArray(gltf.bufferViews) ? [...gltf.bufferViews] : [],
    appended: [],
    length: chunks.bin.byteLength,
  }
}

function appendView(work: SkinWorkspace, bytes: Uint8Array, stride: number): number {
  const pad = (stride - (work.length % stride)) % stride
  if (pad > 0) {
    work.appended.push(new Uint8Array(pad))
    work.length += pad
  }
  work.views.push({ buffer: 0, byteOffset: work.length, byteLength: bytes.byteLength })
  work.appended.push(bytes)
  work.length += bytes.byteLength
  return work.views.length - 1
}

/** The bind matrices, as `Skeleton` computes them: the inverse of each bone's world place. */
function bindInversesOf(bones: readonly RigBone[]): number[] {
  const { bones: built } = bonesOfRig({ bones, origin: 'local' })
  for (const bone of built) if (!bone.parent) bone.updateMatrixWorld(true)

  return built.flatMap(bone => [...new Matrix4().copy(bone.matrixWorld).invert().elements])
}

function placement(bone: RigBone): Record<string, number[]> {
  return {
    translation: [bone.rest.position.x, bone.rest.position.y, bone.rest.position.z],
    rotation: [...quaternionOf(bone)],
    scale: [bone.rest.scale.x, bone.rest.scale.y, bone.rest.scale.z],
  }
}

function quaternionOf(bone: RigBone): number[] {
  const turn = new Quaternion().setFromEuler(
    new Euler(bone.rest.rotation.x, bone.rest.rotation.y, bone.rest.rotation.z),
  )

  return [turn.x, turn.y, turn.z, turn.w]
}

function childrenOf(
  bones: readonly RigBone[],
  index: number,
  first: number,
): Record<string, number[]> {
  const name = bones[index]?.name
  const children = bones.flatMap((one, at) => (one.parent === name ? [first + at] : []))

  return children.length > 0 ? { children } : {}
}

/**
 * The nodes this studio did not write — a second save replaces its skeleton, never doubles it.
 *
 * 🛑 `skin` is cleared only where WE had put one: a character rigged elsewhere carries its own,
 * and stripping it would hand back a file whose mesh follows nothing.
 */
function withoutOurs(
  nodes: readonly unknown[],
  ourSkins: ReadonlySet<number>,
): Record<string, unknown>[] {
  const ours = new Set(
    nodes.flatMap((node, index) => (isRecord(node) && isOurBone(node.extras) ? [index] : [])),
  )

  return nodes
    .filter((_, index) => !ours.has(index))
    .map(node => {
      const held = isRecord(node) ? { ...node } : {}
      if (Array.isArray(held.children)) held.children = held.children.filter(one => !ours.has(one))
      if (typeof held.skin === 'number' && ourSkins.has(held.skin)) delete held.skin

      return held
    })
}

/** A skin of ours is one whose joints are bones of ours — glTF marks a skin no other way. */
function isOurSkin(nodes: unknown, skin: unknown): boolean {
  if (!isRecord(skin) || !Array.isArray(skin.joints) || !Array.isArray(nodes)) return false

  return skin.joints.every(joint => {
    const node = typeof joint === 'number' ? nodes[joint] : null
    return isRecord(node) && isOurBone(node.extras)
  })
}

function isOurBone(extras: unknown): boolean {
  if (!isRecord(extras)) return false

  const held = extras[STUDIO_METADATA_KEY]
  return isRecord(held) && held.bone === true
}

function cloneMesh(mesh: unknown): Record<string, unknown> {
  if (!isRecord(mesh)) return {}

  return {
    ...mesh,
    ...(Array.isArray(mesh.primitives) && {
      primitives: mesh.primitives.map(one => (isRecord(one) ? { ...one } : {})),
    }),
  }
}

function primitiveAt(
  meshes: readonly unknown[],
  at: { mesh: number; primitive: number },
): Record<string, unknown> | null {
  const mesh = meshes[at.mesh]
  if (!isRecord(mesh) || !Array.isArray(mesh.primitives)) return null

  const primitive = mesh.primitives[at.primitive]
  return isRecord(primitive) ? primitive : null
}

function accessorFor(
  accessors: unknown[],
  push: (bytes: Uint8Array, stride: number) => number,
  values: Float32Array,
  type = 'MAT4',
): number {
  accessors.push({
    bufferView: push(bytesOf(values), 4),
    componentType: 5126,
    count: values.length / (type === 'MAT4' ? 16 : 4),
    type,
  })

  return accessors.length - 1
}

function unsignedAccessor(
  accessors: unknown[],
  push: (bytes: Uint8Array, stride: number) => number,
  values: Uint16Array,
): number {
  accessors.push({
    bufferView: push(bytesOf(values), 2),
    componentType: 5123,
    count: values.length / 4,
    type: 'VEC4',
  })

  return accessors.length - 1
}

/** A view, never a copy: these buffers were transferred into this worker and are only read. */
function bytesOf(values: Float32Array | Uint16Array): Uint8Array {
  return new Uint8Array(values.buffer, values.byteOffset, values.byteLength)
}

function joined(head: Uint8Array, tail: readonly Uint8Array[], length: number): Uint8Array {
  const bin = new Uint8Array(length)
  bin.set(head)

  let at = head.byteLength
  for (const bytes of tail) {
    bin.set(bytes, at)
    at += bytes.byteLength
  }

  return bin
}

/** What the scene already carried, so another application's own `extras` survive a save. */
function ownExtras(scene: unknown): Record<string, unknown> {
  return isRecord(scene) && isRecord(scene.extras) ? scene.extras : {}
}

/** The buffer the views index into. Its `uri` is kept: a file may name one beside it. */
function firstBuffer(buffers: unknown): Record<string, unknown> {
  const first = Array.isArray(buffers) ? buffers[0] : null
  return isRecord(first) ? first : {}
}
