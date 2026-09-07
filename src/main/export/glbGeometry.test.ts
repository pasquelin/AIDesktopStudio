import { describe, expect, it } from 'vitest'
import { compactGlbGeometry } from './glbGeometry'

const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const BINARY_CHUNK = 0x004e4942

function glbWithIndices(indices: readonly number[]): Uint8Array {
  const json = new TextEncoder().encode(
    JSON.stringify({
      asset: { version: '2.0' },
      buffers: [{ byteLength: indices.length * 4 }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: indices.length * 4, target: 34963 }],
      accessors: [{ bufferView: 0, componentType: 5125, count: indices.length, type: 'SCALAR' }],
    }),
  )
  const jsonLength = Math.ceil(json.byteLength / 4) * 4
  const binaryLength = indices.length * 4
  const result = new Uint8Array(12 + 8 + jsonLength + 8 + binaryLength)
  const data = new DataView(result.buffer)
  data.setUint32(0, GLB_MAGIC, true)
  data.setUint32(4, 2, true)
  data.setUint32(8, result.byteLength, true)
  data.setUint32(12, jsonLength, true)
  data.setUint32(16, JSON_CHUNK, true)
  result.fill(0x20, 20, 20 + jsonLength)
  result.set(json, 20)
  const binaryHeader = 20 + jsonLength
  data.setUint32(binaryHeader, binaryLength, true)
  data.setUint32(binaryHeader + 4, BINARY_CHUNK, true)
  indices.forEach((value, index) => data.setUint32(binaryHeader + 8 + index * 4, value, true))
  return result
}

function decodedJson(source: Uint8Array): unknown {
  const data = new DataView(source.buffer, source.byteOffset, source.byteLength)
  const length = data.getUint32(12, true)
  return JSON.parse(new TextDecoder().decode(source.subarray(20, 20 + length)).trim())
}

function glbWithFollowingFloats(): Uint8Array {
  const source = glbWithIndices([0, 1, 2])
  const data = new DataView(source.buffer)
  const jsonLength = data.getUint32(12, true)
  const originalBinaryHeader = 20 + jsonLength
  const json = new TextEncoder().encode(
    JSON.stringify({
      asset: { version: '2.0' },
      buffers: [{ byteLength: 24 }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 12, target: 34963 },
        { buffer: 0, byteOffset: 12, byteLength: 12, target: 34962 },
      ],
      accessors: [
        { bufferView: 0, componentType: 5125, count: 3, type: 'SCALAR' },
        { bufferView: 1, componentType: 5126, count: 1, type: 'VEC3' },
      ],
    }),
  )
  const nextJsonLength = Math.ceil(json.byteLength / 4) * 4
  const result = new Uint8Array(12 + 8 + nextJsonLength + 8 + 24)
  const output = new DataView(result.buffer)
  output.setUint32(0, GLB_MAGIC, true)
  output.setUint32(4, 2, true)
  output.setUint32(8, result.byteLength, true)
  output.setUint32(12, nextJsonLength, true)
  output.setUint32(16, JSON_CHUNK, true)
  result.fill(0x20, 20, 20 + nextJsonLength)
  result.set(json, 20)
  const binaryHeader = 20 + nextJsonLength
  output.setUint32(binaryHeader, 24, true)
  output.setUint32(binaryHeader + 4, BINARY_CHUNK, true)
  result.set(source.subarray(originalBinaryHeader + 8), binaryHeader + 8)
  ;[1.25, 2.5, 5].forEach((value, index) =>
    output.setFloat32(binaryHeader + 20 + index * 4, value, true),
  )
  return result
}

describe('SAFE GLB geometry buffer optimization', () => {
  it('replaces fitting uint32 indices with exact uint16 indices and shrinks the asset', () => {
    const source = glbWithIndices([0, 1, 65_535])

    const optimized = compactGlbGeometry(source)

    expect(optimized.byteLength).toBeLessThan(source.byteLength)
    expect(decodedJson(optimized)).toMatchObject({
      buffers: [{ byteLength: 8 }],
      bufferViews: [{ byteLength: 6 }],
      accessors: [{ componentType: 5123 }],
    })
    const data = new DataView(optimized.buffer, optimized.byteOffset, optimized.byteLength)
    const binaryHeader = 20 + data.getUint32(12, true)
    expect([
      data.getUint16(binaryHeader + 8, true),
      data.getUint16(binaryHeader + 10, true),
      data.getUint16(binaryHeader + 12, true),
    ]).toEqual([0, 1, 65_535])
  })

  it('keeps an asset byte-identical when an index needs uint32', () => {
    const source = glbWithIndices([0, 65_536, 70_000])

    expect(compactGlbGeometry(source)).toBe(source)
  })

  it('keeps following float buffers aligned and exact after an odd index count', () => {
    const optimized = compactGlbGeometry(glbWithFollowingFloats())
    const data = new DataView(optimized.buffer, optimized.byteOffset, optimized.byteLength)
    const binaryHeader = 20 + data.getUint32(12, true)

    expect(decodedJson(optimized)).toMatchObject({ bufferViews: [{}, { byteOffset: 8 }] })
    expect([
      data.getFloat32(binaryHeader + 16, true),
      data.getFloat32(binaryHeader + 20, true),
      data.getFloat32(binaryHeader + 24, true),
    ]).toEqual([1.25, 2.5, 5])
  })

  it('leaves an asset carrying a chunk it would drop exactly as it found it', () => {
    const source = glbWithIndices([0, 1, 2])
    const extended = new Uint8Array(source.byteLength + 8)
    extended.set(source)
    const data = new DataView(extended.buffer)
    data.setUint32(8, extended.byteLength, true)
    data.setUint32(source.byteLength, 0, true)
    data.setUint32(source.byteLength + 4, 0x4e4b4e55, true)

    expect(compactGlbGeometry(extended)).toBe(extended)
  })

  it('refuses to compact an index buffer aliased by another view', () => {
    const source = glbWithFollowingFloats()
    const data = new DataView(source.buffer)
    const jsonLength = data.getUint32(12, true)
    const jsonText = new TextDecoder().decode(source.subarray(20, 20 + jsonLength)).trim()
    const aliasedText = jsonText.replace('"byteOffset":12', '"byteOffset":0')
    const encoded = new TextEncoder().encode(aliasedText)
    source.fill(0x20, 20, 20 + jsonLength)
    source.set(encoded, 20)

    expect(compactGlbGeometry(source)).toBe(source)
  })
})
