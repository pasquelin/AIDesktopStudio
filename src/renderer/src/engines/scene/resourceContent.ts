import {
  InterleavedBufferAttribute,
  Texture,
  type BufferAttribute,
  type BufferGeometry,
  type Material,
} from 'three'
import { digest, stableKey } from '@shared/hash'
import { byCodeUnit } from '@shared/text'
import { DEFAULT_OPTIMIZATION_POLICY } from '@shared/domain/optimizationPolicy'

type BinaryPart = {
  metadata: string
  bytes: Uint8Array
}

export type ResourceContent<T> = {
  key: (resource: T) => string
  equals: (one: T, other: T) => boolean
}

export function contentKeyer<T extends object>(
  content: ResourceContent<T>,
): (resource: T) => string {
  const held = new WeakMap<T, string>()
  const buckets = new Map<string, T[]>()
  return resource => {
    const known = held.get(resource)
    if (known) return known
    const fingerprint = content.key(resource)
    const bucket = buckets.get(fingerprint) ?? []
    let index = bucket.findIndex(candidate => content.equals(candidate, resource))
    if (index < 0) {
      index = bucket.length
      bucket.push(resource)
      buckets.set(fingerprint, bucket)
    }
    const key = `${fingerprint}:${index}`
    held.set(resource, key)
    return key
  }
}

export const GEOMETRY_CONTENT: ResourceContent<BufferGeometry> = {
  key: geometry => fingerprint(geometryParts(geometry)),
  equals: (one, other) => sameParts(geometryParts(one), geometryParts(other)),
}

export const MATERIAL_CONTENT: ResourceContent<Material> = {
  key: material => digest(materialSpelling(material)),
  equals: (one, other) => sameMaterialValue(one, other, new WeakMap()),
}

export function textureContent(
  texture: Texture,
  maxBytes = DEFAULT_OPTIMIZATION_POLICY.maxSynchronousContentBytes,
): ResourceContent<Texture> | null {
  const parts = textureParts(texture)
  if (!parts || byteLengthOf(parts) > maxBytes) return null
  // The reading taken above is carried, not retaken: one material comparison read the same
  // texture three times over.
  const partsOf = (candidate: Texture): readonly BinaryPart[] | null =>
    candidate === texture ? parts : textureParts(candidate)
  return {
    key: candidate => {
      const candidateParts = partsOf(candidate)
      return candidateParts ? fingerprint(candidateParts) : ''
    },
    equals: (one, other) => {
      const oneParts = partsOf(one)
      const otherParts = partsOf(other)
      return oneParts !== null && otherParts !== null && sameParts(oneParts, otherParts)
    },
  }
}

function geometryParts(geometry: BufferGeometry): readonly BinaryPart[] {
  const parts: BinaryPart[] = []
  if (geometry.index) parts.push(attributePart('index', geometry.index))
  for (const name of Object.keys(geometry.attributes).sort(byCodeUnit)) {
    parts.push(attributePart(`attribute:${name}`, geometry.getAttribute(name)))
  }
  for (const [name, attributes] of Object.entries(geometry.morphAttributes).sort((one, other) =>
    byCodeUnit(one[0], other[0]),
  )) {
    for (const [index, attribute] of (attributes ?? []).entries()) {
      parts.push(attributePart(`morph:${name}:${index}`, attribute))
    }
  }
  parts.push({
    metadata: stableKey({
      drawRange: geometry.drawRange,
      groups: geometry.groups,
      morphTargetsRelative: geometry.morphTargetsRelative,
    }),
    bytes: new Uint8Array(),
  })
  return parts
}

function attributePart(
  name: string,
  attribute: BufferAttribute | InterleavedBufferAttribute,
): BinaryPart {
  return {
    metadata: stableKey({
      name,
      array: attribute.array.constructor.name,
      itemSize: attribute.itemSize,
      normalized: attribute.normalized,
      count: attribute.count,
      usage:
        attribute instanceof InterleavedBufferAttribute ? attribute.data.usage : attribute.usage,
      gpuType: Reflect.get(attribute, 'gpuType'),
      meshPerAttribute: Reflect.get(attribute, 'meshPerAttribute'),
      offset: attribute instanceof InterleavedBufferAttribute ? attribute.offset : 0,
      stride: attribute instanceof InterleavedBufferAttribute ? attribute.data.stride : 0,
    }),
    bytes: bytesOf(attribute.array),
  }
}

function textureParts(texture: Texture): readonly BinaryPart[] | null {
  const images: unknown[] = [texture.source.data, ...texture.mipmaps]
  const pixels = images.map(readableTextureImage)
  if (pixels.some(image => image === null)) return null
  return [
    {
      metadata: stableKey({
        mapping: texture.mapping,
        channel: texture.channel,
        wrapS: texture.wrapS,
        wrapT: texture.wrapT,
        magFilter: texture.magFilter,
        minFilter: texture.minFilter,
        anisotropy: texture.anisotropy,
        format: texture.format,
        internalFormat: texture.internalFormat,
        type: texture.type,
        offset: texture.offset.toArray(),
        repeat: texture.repeat.toArray(),
        center: texture.center.toArray(),
        rotation: texture.rotation,
        matrix: texture.matrix.toArray(),
        matrixAutoUpdate: texture.matrixAutoUpdate,
        generateMipmaps: texture.generateMipmaps,
        premultiplyAlpha: texture.premultiplyAlpha,
        flipY: texture.flipY,
        unpackAlignment: texture.unpackAlignment,
        colorSpace: texture.colorSpace,
        compareFunction: Reflect.get(texture, 'compareFunction'),
      }),
      bytes: new Uint8Array(),
    },
    ...pixels.flatMap((image, index) =>
      image
        ? [
            {
              metadata: stableKey({
                index,
                width: image.width,
                height: image.height,
                depth: image.depth,
                array: image.data.constructor.name,
              }),
              bytes: bytesOf(image.data),
            },
          ]
        : [],
    ),
  ]
}

function byteLengthOf(parts: readonly BinaryPart[]): number {
  return parts.reduce((total, part) => total + part.bytes.byteLength, 0)
}

type ReadableTextureImage = {
  data: ArrayBufferView
  width: number
  height: number
  depth: number
}

function readableTextureImage(image: unknown): ReadableTextureImage | null {
  if (typeof image !== 'object' || image === null) return null
  const data = Reflect.get(image, 'data')
  const width = Reflect.get(image, 'width')
  const height = Reflect.get(image, 'height')
  const depth = Reflect.get(image, 'depth')
  if (!ArrayBuffer.isView(data) || typeof width !== 'number' || typeof height !== 'number') {
    return null
  }
  return { data, width, height, depth: typeof depth === 'number' ? depth : 1 }
}

function materialSpelling(material: Material): string {
  return stableKey(materialValue(material, new WeakSet()))
}

function materialValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value instanceof Texture) {
    const content = textureContent(value)
    return { texture: content ? content.key(value) : `identity:${value.uuid}` }
  }
  if (ArrayBuffer.isView(value)) {
    return { array: value.constructor.name, bytes: bytesFingerprint(bytesOf(value)) }
  }
  if (Array.isArray(value)) return value.map(entry => materialValue(entry, seen))
  if (typeof value !== 'object' || value === null) return value
  if (seen.has(value)) return '[circular]'
  seen.add(value)
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      MATERIAL_IDENTITY_KEYS.has(key) ? [] : [[key, materialValue(entry, seen)]],
    ),
  )
}

const MATERIAL_IDENTITY_KEYS = new Set(['id', 'uuid', 'name', 'version', '_listeners'])

function sameMaterialValue(
  one: unknown,
  other: unknown,
  seen: WeakMap<object, WeakSet<object>>,
): boolean {
  if (one === other) return true
  if (one instanceof Texture && other instanceof Texture) {
    return sameTextureValue(one, other)
  }
  if (ArrayBuffer.isView(one) && ArrayBuffer.isView(other)) {
    return one.constructor === other.constructor && sameBytes(bytesOf(one), bytesOf(other))
  }
  if (Array.isArray(one) && Array.isArray(other)) {
    return sameMaterialArray(one, other, seen)
  }
  const oneObject = materialObjectOf(one)
  const otherObject = materialObjectOf(other)
  if (!oneObject || !otherObject) return Object.is(one, other)
  if (comparisonSeen(oneObject, otherObject, seen)) return true
  return sameMaterialObject(oneObject, otherObject, seen)
}

function sameTextureValue(one: Texture, other: Texture): boolean {
  const oneContent = textureContent(one)
  // No fingerprint first: `equals` already answers exactly, and stops at the first byte that
  // differs, where two keys hash every pixel of both textures before agreeing to compare them.
  return oneContent !== null && textureContent(other) !== null && oneContent.equals(one, other)
}

function sameMaterialArray(
  one: readonly unknown[],
  other: readonly unknown[],
  seen: WeakMap<object, WeakSet<object>>,
): boolean {
  return (
    one.length === other.length &&
    one.every((entry, index) => sameMaterialValue(entry, other[index], seen))
  )
}

function materialObjectOf(value: unknown): object | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null
}

function comparisonSeen(
  one: object,
  other: object,
  seen: WeakMap<object, WeakSet<object>>,
): boolean {
  const paired = seen.get(one)
  if (paired?.has(other)) return true
  if (paired) paired.add(other)
  else seen.set(one, new WeakSet([other]))
  return false
}

function sameMaterialObject(
  one: object,
  other: object,
  seen: WeakMap<object, WeakSet<object>>,
): boolean {
  const oneKeys = materialKeysOf(one)
  const otherKeys = materialKeysOf(other)
  return (
    oneKeys.length === otherKeys.length &&
    oneKeys.every(
      (key, index) =>
        key === otherKeys[index] &&
        sameMaterialValue(Reflect.get(one, key), Reflect.get(other, key), seen),
    )
  )
}

function materialKeysOf(value: object): readonly string[] {
  return Object.keys(value)
    .filter(key => !MATERIAL_IDENTITY_KEYS.has(key))
    .sort(byCodeUnit)
}

function fingerprint(parts: readonly BinaryPart[]): string {
  return digest(parts.map(part => `${part.metadata}:${bytesFingerprint(part.bytes)}`).join('|'))
}

function bytesFingerprint(bytes: Uint8Array): string {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  // Indexed, not iterated: the iterator protocol on a typed array costs several times as much
  // over the megabytes a texture holds.
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index] ?? 0
    first = Math.imul(first ^ byte, 0x01000193)
    second = Math.imul(second ^ byte, 0x85ebca6b)
  }
  return `${bytes.length}:${unsignedHex(first)}:${unsignedHex(second)}`
}

function unsignedHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, '0')
}

function sameParts(one: readonly BinaryPart[], other: readonly BinaryPart[]): boolean {
  if (one.length !== other.length) return false
  return one.every((part, index) => {
    const candidate = other[index]
    return (
      candidate !== undefined &&
      part.metadata === candidate.metadata &&
      sameBytes(part.bytes, candidate.bytes)
    )
  })
}

function sameBytes(one: Uint8Array, other: Uint8Array): boolean {
  if (one.byteLength !== other.byteLength) return false
  for (let index = 0; index < one.byteLength; index += 1) {
    if (one[index] !== other[index]) return false
  }
  return true
}

function bytesOf(view: ArrayBufferView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
}
