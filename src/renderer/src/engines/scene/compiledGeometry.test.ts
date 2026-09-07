import { BufferAttribute, BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { compiledMeshOf, geometryOfCompiledMesh } from './compiledGeometry'

function geometryWith(index: Uint16Array | Uint32Array): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(210_000), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(210_000), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(140_000), 2))
  geometry.setIndex(new BufferAttribute(index, 1))
  return geometry
}

describe('compiledMeshOf', () => {
  it('stores exact indices in the narrowest lossless representation', () => {
    const compact = compiledMeshOf(geometryWith(new Uint32Array([0, 1, 65_535])))
    const wide = compiledMeshOf(geometryWith(new Uint32Array([0, 65_536, 69_999])))

    expect(compact.indexEncoding).toBe('uint16-base64')
    expect(wide.indexEncoding).toBe('uint32-base64')
    expect(compact.index?.length).toBeLessThan(wide.index?.length ?? 0)
    expect(Array.from(geometryOfCompiledMesh(compact).getIndex()?.array ?? [])).toEqual([
      0, 1, 65_535,
    ])
    expect(Array.from(geometryOfCompiledMesh(wide).getIndex()?.array ?? [])).toEqual([
      0, 65_536, 69_999,
    ])
  })

  it('reads an older compiled index whose encoding was omitted as uint32', () => {
    const original = compiledMeshOf(geometryWith(new Uint32Array([0, 65_536, 69_999])))
    const legacy = { ...original, indexEncoding: undefined }

    expect(Array.from(geometryOfCompiledMesh(legacy).getIndex()?.array ?? [])).toEqual([
      0, 65_536, 69_999,
    ])
  })

  it('preserves normalized integer attributes as their rendered float values', () => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0]), 3))
    geometry.setAttribute('normal', new BufferAttribute(new Int8Array([127, 0, -127]), 3, true))

    const restored = geometryOfCompiledMesh(compiledMeshOf(geometry)).getAttribute('normal')

    expect(restored.array).toBeInstanceOf(Float32Array)
    expect(Array.from(restored.array)).toEqual([1, 0, -1])
  })
})
