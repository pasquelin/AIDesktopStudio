import { BufferAttribute, BufferGeometry } from 'three'

export type ModelGeometryBuffers = {
  position: Float32Array
  normal?: Float32Array
  uv?: Float32Array
  tangent?: Float32Array
  color?: Float32Array
  index?: Uint32Array
}

export type LossyModelRequest = {
  id: number
  geometry: ModelGeometryBuffers
  /** Every level asked of one upload: the worker builds the source geometry once. */
  ratios: readonly number[]
}

export type LossyModelResponse =
  | { id: number; done: false; progress: number }
  | { id: number; done: true; ok: true; geometries: readonly ModelGeometryBuffers[] }
  | { id: number; done: true; ok: false; error: string }

const FLOAT_ATTRIBUTES: readonly { name: 'normal' | 'uv' | 'tangent' | 'color'; size: number }[] = [
  { name: 'normal', size: 3 },
  { name: 'uv', size: 2 },
  { name: 'tangent', size: 4 },
  { name: 'color', size: 3 },
]

export function geometryOfBuffers(buffers: ModelGeometryBuffers): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(buffers.position, 3))
  for (const { name, size } of FLOAT_ATTRIBUTES) {
    const array = buffers[name]
    if (array) geometry.setAttribute(name, new BufferAttribute(array, size))
  }
  if (buffers.index) geometry.setIndex(new BufferAttribute(buffers.index, 1))
  return geometry
}

/** `copy` when the caller keeps the geometry: transferring its arrays would detach them. */
export function buffersOfGeometry(
  geometry: BufferGeometry,
  copy: boolean,
): ModelGeometryBuffers | null {
  const position = floatsOf(geometry, 'position', copy)
  if (!position) return null
  const normal = floatsOf(geometry, 'normal', copy)
  const uv = floatsOf(geometry, 'uv', copy)
  const tangent = floatsOf(geometry, 'tangent', copy)
  const color = floatsOf(geometry, 'color', copy)
  const index = geometry.getIndex()?.array
  return {
    position,
    ...(normal ? { normal } : {}),
    ...(uv ? { uv } : {}),
    ...(tangent ? { tangent } : {}),
    ...(color ? { color } : {}),
    ...(index ? { index: indicesOf(index, copy) } : {}),
  }
}

export function transferablesOfBuffers(buffers: readonly ModelGeometryBuffers[]): Transferable[] {
  return buffers.flatMap(entry => Object.values(entry).map(array => array.buffer))
}

function floatsOf(geometry: BufferGeometry, name: string, copy: boolean): Float32Array | null {
  const attribute = geometry.getAttribute(name)
  if (!(attribute instanceof BufferAttribute) || !(attribute.array instanceof Float32Array)) {
    return null
  }
  return copy ? attribute.array.slice() : attribute.array
}

function indicesOf(index: ArrayLike<number>, copy: boolean): Uint32Array {
  if (!(index instanceof Uint32Array)) return Uint32Array.from(index)
  return copy ? index.slice() : index
}
