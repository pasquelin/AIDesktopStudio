import { INFLUENCES, type SkinRequest } from './skinMessage'
import { type SkinBinding, vertexCountOf } from './skinVertices'
import { SKIN_VERTICES_WASM } from './skinVerticesWasmBinary'

type SkinExports = {
  memory: WebAssembly.Memory
  skinRange: (
    positions: number,
    segments: number,
    regions: number,
    bones: number,
    indices: number,
    weights: number,
    from: number,
    to: number,
  ) => void
}

export type WasmSkinBinding = {
  skinRange: (from: number, to: number) => void
  binding: () => SkinBinding
}

const DATA_START = 65_536
const PAGE_BYTES = 65_536

export async function loadSkinVerticesWasm(): Promise<(request: SkinRequest) => WasmSkinBinding> {
  const binary = Uint8Array.from(atob(SKIN_VERTICES_WASM), character => character.charCodeAt(0))
  return createSkinVerticesWasm(binary)
}

export async function createSkinVerticesWasm(
  bytes: BufferSource,
): Promise<(request: SkinRequest) => WasmSkinBinding> {
  const module = await WebAssembly.compile(bytes)
  return request => bindRequest(kernelOf(new WebAssembly.Instance(module)), request)
}

function kernelOf(instance: WebAssembly.Instance): SkinExports {
  const exports = instance.exports
  if (!(exports.memory instanceof WebAssembly.Memory) || typeof exports.skinRange !== 'function') {
    throw new Error('Invalid skinning WebAssembly exports')
  }
  const skinRange = exports.skinRange
  return {
    memory: exports.memory,
    skinRange: (positions, segments, regions, bones, indices, weights, from, to) => {
      skinRange(positions, segments, regions, bones, indices, weights, from, to)
    },
  }
}

function bindRequest(kernel: SkinExports, request: SkinRequest): WasmSkinBinding {
  const vertices = vertexCountOf(request)
  const bones = Math.floor(request.segments.length / 6)
  if (bones === 0 || bones > 4096) throw new Error('Unsupported WebAssembly bone count')
  const positions = DATA_START
  const segments = align(positions + request.position.byteLength, 4)
  const regions = segments + request.segments.byteLength
  const indices = align(regions + request.regions.byteLength, 2)
  const indicesEnd = indices + vertices * INFLUENCES * Uint16Array.BYTES_PER_ELEMENT
  const weights = align(indicesEnd, 4)
  const end = weights + vertices * INFLUENCES * Float32Array.BYTES_PER_ELEMENT
  const missingPages = Math.ceil((end - kernel.memory.buffer.byteLength) / PAGE_BYTES)
  if (missingPages > 0) kernel.memory.grow(missingPages)

  new Float32Array(kernel.memory.buffer, positions, request.position.length).set(request.position)
  new Float32Array(kernel.memory.buffer, segments, request.segments.length).set(request.segments)
  new Uint8Array(kernel.memory.buffer, regions, request.regions.length).set(request.regions)

  return {
    skinRange: (from, to) => {
      kernel.skinRange(positions, segments, regions, bones, indices, weights, from, to)
    },
    binding: () => ({
      skinIndex: new Uint16Array(kernel.memory.buffer.slice(indices, indicesEnd)),
      skinWeight: new Float32Array(kernel.memory.buffer.slice(weights, end)),
    }),
  }
}

function align(value: number, bytes: number): number {
  return Math.ceil(value / bytes) * bytes
}
