import { BufferAttribute, BufferGeometry, type InterleavedBufferAttribute } from 'three'
import { bytesFromBase64, bytesToBase64 } from '@shared/base64'
import type { CompiledMeshGeometry } from '@shared/domain/gameExport'

export function compiledMeshOf(geometry: BufferGeometry): CompiledMeshGeometry {
  const index = geometry.getIndex()
  const compactIndex = index ? compactIndexOf(index) : null
  return {
    encoding: 'float32-base64',
    position: floatAttributeBase64(geometry.getAttribute('position')),
    normal: floatAttributeBase64(geometry.getAttribute('normal')),
    uv: floatAttributeBase64(geometry.getAttribute('uv')),
    ...(compactIndex
      ? {
          index: bytesToBase64(new Uint8Array(compactIndex.buffer)),
          indexEncoding: compactIndex.encoding,
        }
      : {}),
    ...(geometry.getAttribute('tangent')
      ? { tangent: floatAttributeBase64(geometry.getAttribute('tangent')) }
      : {}),
    ...(geometry.getAttribute('color')
      ? { color: floatAttributeBase64(geometry.getAttribute('color')) }
      : {}),
  }
}

export function geometryOfCompiledMesh(mesh: CompiledMeshGeometry): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(floatsFrom(mesh.position), 3))
  if (mesh.normal) geometry.setAttribute('normal', new BufferAttribute(floatsFrom(mesh.normal), 3))
  if (mesh.uv) geometry.setAttribute('uv', new BufferAttribute(floatsFrom(mesh.uv), 2))
  if (mesh.tangent)
    geometry.setAttribute('tangent', new BufferAttribute(floatsFrom(mesh.tangent), 4))
  if (mesh.color) geometry.setAttribute('color', new BufferAttribute(floatsFrom(mesh.color), 3))
  if (mesh.index)
    geometry.setIndex(new BufferAttribute(indicesFrom(mesh.index, mesh.indexEncoding), 1))
  return geometry
}

function attributeBase64(attribute: BufferAttribute): string {
  return bytesToBase64(
    new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength),
  )
}

function floatAttributeBase64(
  attribute: BufferAttribute | InterleavedBufferAttribute | undefined,
): string {
  if (!attribute) return ''
  if (
    attribute instanceof BufferAttribute &&
    attribute.array instanceof Float32Array &&
    !attribute.normalized
  ) {
    return attributeBase64(attribute)
  }

  const values = new Float32Array(attribute.count * attribute.itemSize)
  for (let item = 0; item < attribute.count; item += 1) {
    for (let component = 0; component < attribute.itemSize; component += 1) {
      values[item * attribute.itemSize + component] = attribute.getComponent(item, component)
    }
  }
  return attributeBase64(new BufferAttribute(values, attribute.itemSize))
}

function floatsFrom(encoded: string): Float32Array {
  const bytes = bytesFromBase64(encoded)
  return new Float32Array(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength / Float32Array.BYTES_PER_ELEMENT,
  )
}

function indicesFrom(
  encoded: string,
  encoding: CompiledMeshGeometry['indexEncoding'],
): Uint16Array | Uint32Array {
  const bytes = bytesFromBase64(encoded)
  if (encoding === 'uint16-base64') {
    return new Uint16Array(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength / Uint16Array.BYTES_PER_ELEMENT,
    )
  }
  return new Uint32Array(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength / Uint32Array.BYTES_PER_ELEMENT,
  )
}

function compactIndexOf(attribute: BufferAttribute): {
  buffer: ArrayBuffer
  encoding: 'uint16-base64' | 'uint32-base64'
} {
  let maximum = 0
  for (let index = 0; index < attribute.count; index += 1) {
    maximum = Math.max(maximum, attribute.getX(index))
  }
  const values =
    maximum <= 65_535 ? new Uint16Array(attribute.count) : new Uint32Array(attribute.count)
  for (let index = 0; index < attribute.count; index += 1) values[index] = attribute.getX(index)
  return {
    buffer: values.buffer,
    encoding: values instanceof Uint16Array ? 'uint16-base64' : 'uint32-base64',
  }
}
