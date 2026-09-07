import {
  type BufferAttribute,
  type InterleavedBufferAttribute,
  Matrix4,
  type Object3D,
  Vector3,
} from 'three'
import type { AutoRigInferenceRequest } from '@shared/domain/autoRigInference'
import { reskinnableMeshesOf } from './rigBuild'

const VERTICES_PER_SLICE = 32_768

const yieldToUi = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

export async function autoRigInputFor(
  holder: Object3D,
  yieldWork: () => Promise<void> = yieldToUi,
  signal?: AbortSignal,
): Promise<Omit<AutoRigInferenceRequest, 'id' | 'backendId' | 'options'> | null> {
  const meshes = reskinnableMeshesOf(holder)
  if (meshes.length === 0) return null
  holder.updateWorldMatrix(true, true)
  const toHolder = new Matrix4().copy(holder.matrixWorld).invert()
  const positions = new Float32Array(vertexCountOf(meshes) * 3)
  const triangles = new Uint32Array(indexCountOf(meshes))
  const primitives = []
  let positionOffset = 0
  let triangleOffset = 0
  for (const [meshIndex, mesh] of meshes.entries()) {
    const position = mesh.geometry.getAttribute('position')
    const transform = new Matrix4().multiplyMatrices(toHolder, mesh.matrixWorld)
    const vertexOffset = positionOffset / 3
    positionOffset = await copyPositions(
      position,
      transform,
      positions,
      positionOffset,
      yieldWork,
      signal,
    )
    triangleOffset = await copyTriangles(
      mesh.geometry.index,
      position.count,
      vertexOffset,
      triangles,
      triangleOffset,
      yieldWork,
      signal,
    )
    primitives.push({
      mesh: meshIndex,
      primitive: 0,
      vertexOffset,
      vertexCount: position.count,
    })
  }
  return {
    positions,
    triangles,
    primitives,
  }
}

type RigMeshes = ReturnType<typeof reskinnableMeshesOf>

function vertexCountOf(meshes: RigMeshes): number {
  return meshes.reduce((total, mesh) => total + mesh.geometry.getAttribute('position').count, 0)
}

function indexCountOf(meshes: RigMeshes): number {
  return meshes.reduce(
    (total, mesh) =>
      total + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count),
    0,
  )
}

async function copyPositions(
  source: BufferAttribute | InterleavedBufferAttribute,
  transform: Matrix4,
  destination: Float32Array,
  offset: number,
  yieldWork: () => Promise<void>,
  signal?: AbortSignal,
): Promise<number> {
  const point = new Vector3()
  for (let vertex = 0; vertex < source.count; vertex += 1) {
    point.fromBufferAttribute(source, vertex).applyMatrix4(transform)
    destination[offset] = point.x
    destination[offset + 1] = point.y
    destination[offset + 2] = point.z
    offset += 3
    if ((vertex + 1) % VERTICES_PER_SLICE === 0) await yieldOrCancel(yieldWork, signal)
  }
  return offset
}

async function copyTriangles(
  source: BufferAttribute | null,
  vertexCount: number,
  vertexOffset: number,
  destination: Uint32Array,
  offset: number,
  yieldWork: () => Promise<void>,
  signal?: AbortSignal,
): Promise<number> {
  const count = source?.count ?? vertexCount
  for (let value = 0; value < count; value += 1) {
    destination[offset] = vertexOffset + (source?.getX(value) ?? value)
    offset += 1
    if ((value + 1) % VERTICES_PER_SLICE === 0) await yieldOrCancel(yieldWork, signal)
  }
  return offset
}

async function yieldOrCancel(yieldWork: () => Promise<void>, signal?: AbortSignal): Promise<void> {
  await yieldWork()
  if (signal?.aborted) throw new Error('CANCELLED')
}
