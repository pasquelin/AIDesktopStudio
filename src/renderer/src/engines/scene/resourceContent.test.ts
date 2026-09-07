import { BoxGeometry, DataTexture, MeshStandardMaterial, ShaderMaterial, Texture } from 'three'
import { describe, expect, it } from 'vitest'
import {
  contentKeyer,
  GEOMETRY_CONTENT,
  MATERIAL_CONTENT,
  textureContent,
  type ResourceContent,
} from './resourceContent'

describe('resource content', () => {
  it('compares every geometry byte and draw setting rather than object identity', () => {
    const first = new BoxGeometry()
    const copy = new BoxGeometry()

    expect(GEOMETRY_CONTENT.key(copy)).toBe(GEOMETRY_CONTENT.key(first))
    expect(GEOMETRY_CONTENT.equals(first, copy)).toBe(true)

    copy.drawRange.count = 3
    expect(GEOMETRY_CONTENT.equals(first, copy)).toBe(false)
  })

  it('keeps render material flags in the signature while ignoring UUIDs', () => {
    const first = new MeshStandardMaterial({ roughness: 0.4 })
    const copy = new MeshStandardMaterial({ roughness: 0.4 })

    expect(MATERIAL_CONTENT.key(copy)).toBe(MATERIAL_CONTENT.key(first))
    expect(MATERIAL_CONTENT.equals(first, copy)).toBe(true)

    copy.depthWrite = false
    expect(MATERIAL_CONTENT.equals(first, copy)).toBe(false)
  })

  it('compares readable texture pixels and sampler settings exactly', () => {
    const first = new DataTexture(new Uint8Array([1, 2, 3, 255]), 1, 1)
    const copy = new DataTexture(new Uint8Array([1, 2, 3, 255]), 1, 1)
    const content = textureContent(first)
    if (!content) throw new Error('data texture content is unreadable')

    expect(content.key(copy)).toBe(content.key(first))
    expect(content.equals(first, copy)).toBe(true)

    copy.flipY = !first.flipY
    expect(content.equals(first, copy)).toBe(false)
  })

  it('keeps manual texture matrices and depth comparisons in the signature', () => {
    const first = new DataTexture(new Uint8Array([1, 2, 3, 255]), 1, 1)
    const copy = first.clone()
    copy.source = first.source
    first.matrixAutoUpdate = false
    copy.matrixAutoUpdate = false
    copy.matrix.set(1, 0, 0.25, 0, 1, 0, 0, 0, 1)
    const content = textureContent(first)
    if (!content) throw new Error('data texture content is unreadable')

    expect(content.equals(first, copy)).toBe(false)
    copy.matrix.copy(first.matrix)
    Reflect.set(copy, 'compareFunction', 515)
    expect(content.equals(first, copy)).toBe(false)
  })

  it('refuses a readable texture above the synchronous byte budget', () => {
    const texture = new DataTexture(new Uint8Array(16), 2, 2)

    expect(textureContent(texture, 15)).toBeNull()
    expect(textureContent(texture, 16)).not.toBeNull()
  })

  it('distinguishes typed-array constructors in shader uniforms', () => {
    const first = new ShaderMaterial({ uniforms: { values: { value: new Uint8Array([1, 2]) } } })
    const copy = new ShaderMaterial({ uniforms: { values: { value: new Uint16Array([513]) } } })

    expect(MATERIAL_CONTENT.equals(first, copy)).toBe(false)
    expect(MATERIAL_CONTENT.key(first)).not.toBe(MATERIAL_CONTENT.key(copy))
  })

  it('disambiguates fingerprint collisions with exact equality', () => {
    type Value = { value: number }
    const content: ResourceContent<Value> = {
      key: () => 'collision',
      equals: (one, other) => one.value === other.value,
    }
    const keyOf = contentKeyer(content)

    expect(keyOf({ value: 1 })).toBe(keyOf({ value: 1 }))
    expect(keyOf({ value: 1 })).not.toBe(keyOf({ value: 2 }))
  })

  it('keeps materials apart when one texture byte differs', () => {
    const first = new MeshStandardMaterial({
      map: new DataTexture(new Uint8Array([1, 2, 3, 255]), 1, 1),
    })
    const second = new MeshStandardMaterial({
      map: new DataTexture(new Uint8Array([1, 2, 4, 255]), 1, 1),
    })

    expect(MATERIAL_CONTENT.equals(first, second)).toBe(false)
    expect(MATERIAL_CONTENT.key(first)).not.toBe(MATERIAL_CONTENT.key(second))
  })

  it('refuses content matching when texture pixels are unavailable', () => {
    const opaque = new Texture({ width: 1, height: 1 })

    expect(textureContent(opaque)).toBeNull()
  })
})
