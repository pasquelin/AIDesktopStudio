import { describe, expect, it } from 'vitest'
import { meshFormatForExtension, meshFormatOf } from './meshFormat'

const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text)

it('maps imported extensions to the loader that validates their content', () => {
  expect(meshFormatForExtension('OBJ')).toBe('obj')
  expect(meshFormatForExtension('dae')).toBe('collada')
  expect(meshFormatForExtension('usdz')).toBe('usd')
})

/** A binary STL of `triangles` faces: 80 bytes of header, the count, then 50 bytes each. */
function binaryStl(triangles: number, header = 'exported by something'): Uint8Array {
  const bytes = new Uint8Array(84 + triangles * 50)
  bytes.set(bytesOf(header).subarray(0, 80))
  new DataView(bytes.buffer).setUint32(80, triangles, true)
  return bytes
}

describe('what a file of shapes is, by its bytes', () => {
  it('reads a binary glTF and a JSON one as the same format', () => {
    expect(meshFormatOf(bytesOf('glTF'))).toBe('gltf')
    expect(meshFormatOf(bytesOf('\n  {"asset":{"version":"2.0"}}'))).toBe('gltf')
  })

  it('reads both spellings of FBX', () => {
    expect(meshFormatOf(bytesOf('Kaydara FBX Binary'))).toBe('fbx')
    expect(meshFormatOf(bytesOf('; FBX 7.4.0 project file\n\nFBXHeaderExtension:  {\n'))).toBe(
      'fbx',
    )
  })

  it('reads a PLY, and leaves a word that merely opens like one alone', () => {
    expect(meshFormatOf(bytesOf('ply\nformat ascii 1.0\n'))).toBe('ply')
    expect(meshFormatOf(bytesOf('plywood is not a format'))).toBeNull()
  })

  it('reads an OBJ by the directives at the head of its lines', () => {
    expect(meshFormatOf(bytesOf('# Blender v3.6\nmtllib cube.mtl\nv 1.0 1.0 1.0\n'))).toBe('obj')
  })

  it('reads an ASCII STL', () => {
    expect(meshFormatOf(bytesOf('solid cube\n facet normal 0 0 1\n'))).toBe('stl')
  })

  /**
   * The trap this format is known for: a binary STL is free to open its 80-byte header with the
   * word `solid`, and reading the word alone calls it ASCII. The LENGTH is what answers.
   */
  it('reads a binary STL whose header opens on the word ASCII uses', () => {
    expect(meshFormatOf(binaryStl(12, 'solid cube exported by something'))).toBe('stl')
  })

  it('leaves a binary file whose length does not add up alone', () => {
    expect(meshFormatOf(binaryStl(12).subarray(0, 400))).toBeNull()
  })

  it('reads the three spellings of USD, and only calls Collada what says so', () => {
    expect(meshFormatOf(bytesOf('PK'))).toBe('usd')
    expect(meshFormatOf(bytesOf('PXR-USDC'))).toBe('usd')
    expect(meshFormatOf(bytesOf('#usda 1.0\n'))).toBe('usd')
    expect(meshFormatOf(bytesOf('<?xml version="1.0"?>\n<COLLADA xmlns="x">'))).toBe('collada')
    expect(meshFormatOf(bytesOf('<?xml version="1.0"?>\n<svg width="10">'))).toBeNull()
  })

  it('reads a BVH capture by the word its hierarchy opens on', () => {
    expect(meshFormatOf(bytesOf('HIERARCHY\nROOT Hips\n{\n'))).toBe('bvh')
  })

  it('answers nothing for what it does not know, rather than guessing', () => {
    expect(meshFormatOf(bytesOf('PNG\r\n\n'))).toBeNull()
    expect(meshFormatOf(new Uint8Array(0))).toBeNull()
  })
})
